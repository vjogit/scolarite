package importer

// CocleToMatiere mappe le code cours du système planning (COCLE/CO)
// vers le nom exact de la matière en base de données (tel qu'importé depuis l'Excel).
// Clé   : valeur du champ COCLE dans reservations.json (= CO dans cours.json)
// Valeur : matiere.name en BDD
//
// Généré semi-automatiquement — les cas [APPROX] ont été vérifiés manuellement.
// Les COCLE absents de ce map (événements, accueil, cours hors périmètre...)
// produiront une réservation avec matiere_id = NULL.
var CocleToMatiere = map[string]string{
	// ── S5 INFRES ────────────────────────────────────────────────────────────

	// 5.1 MATH
	"295":  "5.1 MATHEMATIQUES POUR L'INGENIEUR",
	"1992": "5.1 PROBABIITÉS ET STATISTIQUES",
	"296":  "5.1 STRUCUTRES DE DONÉES ET ALGORTHMIQUE",

	// 5.2 BST
	"297":  "5.2 LANGAGE DE DÉVELOPPEMENT FONCTIONNEL",
	"300":  "5.2 RÉSEAUX ET PROTOCOLES -1",
	"1680": "", // 5.2 DEVOPS — absent de l'Excel, à compléter si présent en BDD

	// 5.3 BST
	"298": "5.3 PROJETS INTÉGRATEURS",
	"302": "5.3 UNIX", // planning: "5.3 UNIX UTILISATEURS" → Excel: "5.3 UNIX"

	// 5.4 BST
	"303": "5.4 FRONTED",
	"304": "5.4 LANGAGE DE DÉVELOPPEMENT ORIENTÉ OBJET",

	// 5.5 ASSI
	"305": "5.5 ETHICAL HACKING",
	"548": "5.5 VIRTUALISATION ET CONTENEURISATION: FONDAMENTAUX",

	// 5.6 DIM
	"551": "5.6 GESTION DE PROJET: OUTILS ET MÉTHODES",
	"309": "5.6 JEU D'ENTREPRISE INITIATION À LA GESTION",

	// 5.7 LING
	"310": "5.7 ANGLAIS",

	// 5.8 DPPA
	"1994": "5.8 MISSION1 :PROJET D'EMPLOI",
	"2050": "", // 5.8 DPPA THÉATRE — absent de l'Excel, à compléter si présent en BDD
	"312":  "", // 5.8 PRES. REFERENTIEL DE COMPETENCES — absent de l'Excel

	// 6.x (hors périmètre S5)
	"2066": "", // 6.1 FONDEMENTS DE L'IA — S6, non couvert par l'Excel S5
}
