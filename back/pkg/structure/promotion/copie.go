package promotion

// Création d'une promotion par gabarit (16 septembre 2026) : la promotion
// précédente sert de modèle à la suivante. Personne ne ressaisit une maquette
// entière ni vingt-cinq compétences chaque année — le nom d'une UE ou d'une
// matière est l'identité stable à travers les promotions, un changement de
// nom signifie un nouveau cours.
//
// Périmètre de la copie, tranché : options, périodes avec leurs dates telles
// quelles (à corriger à l'écran, un décalage automatique serait faux une
// année sur deux), UE (nom, ECTS, académique, description et responsable
// syllabus), matières (nom, heures, coefficient, couleur) et leurs fiches
// syllabus (rubriques, ventilation, responsable), blocs et compétences du
// référentiel, liaisons UE ↔ compétence. Jamais ce qui appartient aux élèves
// ou à l'année : groupes, contrôles, notes, jurys, réservations,
// certifications. Une seule transaction : la promotion neuve existe entière
// ou pas du tout.
//
// L'acte est « créer une promotion », sous STRUCTURE_ECRITURE, contenu
// syllabus compris — exception assumée au rôle SYLLABUS_ECRITURE : ce contenu
// a déjà été rédigé sur le gabarit par un porteur de ce rôle, il n'est pas
// écrit ici. Scinder en deux gestes sous deux rôles laisserait un état
// intermédiaire (structure sans référentiel) que rien ne signalerait.

import (
	"context"
	"cyb-react/pkg/structure/promotion/gen"
	"fmt"
)

// copierDepuis recopie, dans la transaction de l'appelant, le contenu de la
// promotion source dans la promotion cible (déjà créée). Ordre parent → enfant,
// le référentiel d'abord : les liaisons des UE ont besoin du re-mappage des
// compétences. Les requêtes lisent les vues actives : une branche en
// corbeille ne se copie pas.
func copierDepuis(ctx context.Context, q *gen.Queries, source int32, cible int32) error {
	competences := map[int32]int32{} // compétence source → compétence copiée

	blocs, err := q.FetchBlocIdsByPromotionID(ctx, source)
	if err != nil {
		return fmt.Errorf("lecture des blocs : %w", err)
	}
	for _, b := range blocs {
		nb, err := q.CopierBloc(ctx, gen.CopierBlocParams{PromotionID: cible, Source: b})
		if err != nil {
			return fmt.Errorf("copie du bloc %d : %w", b, err)
		}
		cs, err := q.FetchCompetenceIdsByBlocID(ctx, b)
		if err != nil {
			return err
		}
		for _, c := range cs {
			nc, err := q.CopierCompetence(ctx, gen.CopierCompetenceParams{BlocID: nb, Source: c})
			if err != nil {
				return fmt.Errorf("copie de la compétence %d : %w", c, err)
			}
			competences[c] = nc
		}
	}

	options, err := q.FetchOptionIdsByPromotionID(ctx, source)
	if err != nil {
		return fmt.Errorf("lecture des options : %w", err)
	}
	for _, o := range options {
		no, err := q.CopierOption(ctx, gen.CopierOptionParams{PromotionID: cible, Source: o})
		if err != nil {
			return fmt.Errorf("copie de l'option %d : %w", o, err)
		}
		periodes, err := q.FetchPeriodeIdsByOptionID(ctx, o)
		if err != nil {
			return err
		}
		for _, pe := range periodes {
			npe, err := q.CopierPeriode(ctx, gen.CopierPeriodeParams{OptionID: no, Source: pe})
			if err != nil {
				return fmt.Errorf("copie de la période %d : %w", pe, err)
			}
			ues, err := q.FetchUeIdsByPeriodeID(ctx, pe)
			if err != nil {
				return err
			}
			for _, ue := range ues {
				if err := copierUE(ctx, q, ue, npe, competences); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

// copierUE recopie une UE sous la période copiée : ses matières et leurs
// fiches, puis sa matrice, re-mappée sur les compétences copiées.
func copierUE(ctx context.Context, q *gen.Queries, ue int32, periode int32, competences map[int32]int32) error {
	nue, err := q.CopierUniteEnseignement(ctx, gen.CopierUniteEnseignementParams{PeriodeID: periode, Source: ue})
	if err != nil {
		return fmt.Errorf("copie de l'UE %d : %w", ue, err)
	}
	// Les traductions suivent ce qu'elles traduisent (lot 6) : une relecture
	// faite sur le gabarit n'est pas à refaire sur la promotion suivante.
	if _, err := q.CopierUniteEnseignementTraductions(ctx, gen.CopierUniteEnseignementTraductionsParams{UeID: nue, Source: ue}); err != nil {
		return fmt.Errorf("copie des traductions de l'UE %d : %w", ue, err)
	}
	matieres, err := q.FetchMatiereIdsByUeID(ctx, ue)
	if err != nil {
		return err
	}
	for _, m := range matieres {
		nm, err := q.CopierMatiere(ctx, gen.CopierMatiereParams{UeID: nue, Source: m})
		if err != nil {
			return fmt.Errorf("copie de la matière %d : %w", m, err)
		}
		if _, err := q.CopierSyllabusMatiere(ctx, gen.CopierSyllabusMatiereParams{MatiereID: nm, Source: m}); err != nil {
			return fmt.Errorf("copie de la fiche syllabus de la matière %d : %w", m, err)
		}
		if _, err := q.CopierSyllabusMatiereTraductions(ctx, gen.CopierSyllabusMatiereTraductionsParams{MatiereID: nm, Source: m}); err != nil {
			return fmt.Errorf("copie des traductions de la fiche de la matière %d : %w", m, err)
		}
	}
	liaisons, err := q.FetchUeCompetencesByUeID(ctx, ue)
	if err != nil {
		return err
	}
	for _, l := range liaisons {
		nc, ok := competences[l.CompetenceID]
		if !ok {
			// Une liaison vers une compétence d'une autre promotion n'existe
			// pas (garantie serveur de la matrice) ; si elle existait, la
			// copier créerait un lien hors promotion — on l'ignore.
			continue
		}
		if err := q.CopierUeCompetence(ctx, gen.CopierUeCompetenceParams{
			UeID: nue, CompetenceID: nc, Enseignee: l.Enseignee, MiseEnOeuvre: l.MiseEnOeuvre, Evaluee: l.Evaluee,
		}); err != nil {
			return fmt.Errorf("copie de la liaison de l'UE %d : %w", ue, err)
		}
	}
	return nil
}
