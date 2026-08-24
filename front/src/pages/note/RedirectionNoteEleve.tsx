/**
 * L'ancienne entrée `/resultat/note_eleve`, conduite vers l'axe Élève.
 *
 * C'est la seule redirection du lot. Les quatre autres écrans de notes gardent
 * leur URL mot pour mot : ils étaient déjà des axes, ils n'ont pas bougé.
 *
 * Cet écran-ci, lui, vivait hors de tout — pas d'élève dans l'URL, pas de
 * contexte, pas de fil. Il n'y a donc rien à traduire depuis l'ancienne
 * adresse : on repart du contexte mémorisé, comme le fait l'entrée normale d'un
 * workflow, et on ouvre l'axe Élève au plus profond qu'il permette. Sans
 * période connue, on atterrit sur la liste où la sélection s'interrompt, et
 * l'utilisateur poursuit — jamais sur une page morte.
 */

import { Navigate } from 'react-router';

import { useContexteHierarchie } from '../../services/context/contexte';
import { construireCheminWorkflow } from '../../services/context/navigation';
import { WORKFLOW_NOTE } from '../../services/context/workflows';
import { AXE_ELEVE, cheminVersAxe } from './axes';

export function RedirectionNoteEleve() {
    const { pourNavigation } = useContexteHierarchie();

    const contexte = construireCheminWorkflow(WORKFLOW_NOTE, pourNavigation);
    return <Navigate to={cheminVersAxe(contexte, AXE_ELEVE)} replace />;
}
