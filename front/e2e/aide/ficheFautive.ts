import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Construit à la volée une fiche de notes .xlsx minimale mais valide au sens
 * de `back/pkg/resultat/note/fiche_note_import.go` (`parseControleID` lit la
 * ligne 6 colonne B, `lireFiche` les données à partir de la ligne 14) — deux
 * lignes fautives : une note hors barème, une cellule illisible.
 *
 * Générée au lancement du test plutôt que committée : `.gitignore` exclut
 * `**\/*.xlsx`, et un fichier construit ici reste toujours en phase avec le
 * format que le backend attend réellement, sans figer un identifiant de
 * contrôle qui change à chaque seed.
 *
 * xl/*.xml à la main, zippé par le `zip` système : aucune dépendance
 * supplémentaire (la dérogation accordée porte sur @playwright/test, pas au-delà).
 * Les identifiants d'élève des lignes fautives sont arbitraires — ni l'une ni
 * l'autre n'atteint le contrôle d'existence de l'élève, qui ne porte que sur
 * les lignes valides (voir `lireFiche` : hors-barème et illisible sont
 * écartées avant).
 */
export function genererFicheFautive(controleId: number): string {
    const racine = mkdtempSync(join(tmpdir(), 'fiche-fautive-'));
    const xl = join(racine, 'xl');
    mkdirSync(join(xl, 'worksheets'), { recursive: true });
    mkdirSync(join(xl, '_rels'), { recursive: true });
    mkdirSync(join(racine, '_rels'), { recursive: true });

    writeFileSync(join(racine, '[Content_Types].xml'), [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
        '</Types>',
    ].join('\n'));

    writeFileSync(join(racine, '_rels', '.rels'), [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
        '</Relationships>',
    ].join('\n'));

    writeFileSync(join(xl, 'workbook.xml'), [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        '<sheets><sheet name="Feuille1" sheetId="1" r:id="rId1"/></sheets>',
        '</workbook>',
    ].join('\n'));

    writeFileSync(join(xl, '_rels', 'workbook.xml.rels'), [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
        '</Relationships>',
    ].join('\n'));

    const cellule = (ref: string, valeur: string) => `<c r="${ref}" t="inlineStr"><is><t>${valeur}</t></is></c>`;
    const lignesVides = (debut: number, fin: number) =>
        Array.from({ length: fin - debut + 1 }, (_, i) => `<row r="${debut + i}"/>`).join('');

    const lignesDonnees = [
        { r: 14, id: 900001, nom: 'E2E', prenom: 'HorsBareme', note: '99' },
        { r: 15, id: 900002, nom: 'E2E', prenom: 'Illisible', note: 'abc' },
    ].map(({ r, id, nom, prenom, note }) =>
        `<row r="${r}">${cellule(`A${r}`, String(id))}${cellule(`B${r}`, nom)}${cellule(`C${r}`, prenom)}${cellule(`D${r}`, note)}</row>`);

    const sheet = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
        lignesVides(1, 5),
        `<row r="6">${cellule('A6', 'Controle id:')}${cellule('B6', String(controleId))}</row>`,
        lignesVides(7, 13),
        ...lignesDonnees,
        '</sheetData></worksheet>',
    ].join('');
    writeFileSync(join(xl, 'worksheets', 'sheet1.xml'), sheet);

    const sortie = join(racine, 'fiche-fautive.xlsx');
    execFileSync('zip', ['-X', '-r', sortie, '[Content_Types].xml', '_rels', 'xl'], { cwd: racine });
    return sortie;
}

/** Supprime le répertoire temporaire produit par `genererFicheFautive`. */
export function nettoyerFicheFautive(chemin: string): void {
    rmSync(join(chemin, '..'), { recursive: true, force: true });
}
