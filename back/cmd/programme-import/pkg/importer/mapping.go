package importer

// CocleToMatiere mappe le code cours du système planning (COCLE/CO)
// vers le nom exact de la matière en base de données.
// Clé   : COCLE (= CO dans cours.json)
// Valeur : matiere.name en BDD  (chaîne vide = matiere_id NULL)
//
// PÉRIMÈTRE : toutes promotions (généré semi-automatiquement par rapprochement flou).
// Annotation de fin de ligne : [confiance sc=score].
//
//	vérifié      : mapping INFRES contrôlé manuellement (référence)
//	auto·haute   : rapprochement très probable (sc >= 1.05)
//	auto·moyenne : rapprochement probable, à confirmer (0.85-1.05)
//	à vérifier   : laissé VIDE (NULL) ; meilleur candidat indiqué en commentaire
//	événement    : hors cours (accueil, visite, contrôle...) -> NULL volontaire
//	absent BDD   : matiere non presente dans l'export -> NULL
//
// >>> Voir audit_mapping_cours.xlsx pour valider les cas "à vérifier".
var CocleToMatiere = map[string]string{

	// ┌─ 1A INFRES  (28/43 mappés) ───────────────────────────────────────────────
	"1096": "",                                                     // [événement] ECOLE FERMEE (1A INFRES)
	"1686": "",                                                     // [événement] IMT' GO - CHALLENGE RENTREE (1A INFRES)
	"386":  "",                                                     // [événement] MISE EN ROUTE IPADS (1A INFRES)
	"2067": "",                                                     // [événement] PRESENTATION: VALORISAT° DU PARCOURS ETU (1A INFRES)
	"1985": "",                                                     // [événement] PRÉSENTATION DU DPPA (1A INFRES)
	"389":  "",                                                     // [événement] RENCONTRE APPRENTIS/TUTEURS (1A INFRES)
	"1508": "",                                                     // [événement] VISITE ECOLE (1A INFRES)
	"295":  "5.1 MATHEMATIQUES POUR L'INGENIEUR",                   // [vérifié sc=1.13] 5.1 MATHEMATIQUES (1A INFRES)
	"1992": "5.1 PROBABIITÉS ET STATISTIQUES",                      // [vérifié sc=0.9] 5.1 PROBABILITES ET STATISTIQUES (1A INFRES)
	"296":  "5.1 STRUCUTRES DE DONÉES ET ALGORTHMIQUE",             // [vérifié sc=1.02] 5.1 STRUCTURES DE DONNEES-ALGORITHMIQUE (1A INFRES)
	"1680": "",                                                     // [absent BDD] 5.2 DEVOPS (1A INFRES)
	"297":  "5.2 LANGAGE DE DÉVELOPPEMENT FONCTIONNEL",             // [vérifié sc=1.35] 5.2 LANGAGE DE DEVELOPPEMENT FONCTIONNEL (1A INFRES)
	"300":  "5.2 RÉSEAUX ET PROTOCOLES -1",                         // [vérifié sc=1.35] 5.2 RESEAUX ET PROTOCOLES -1 (1A INFRES)
	"298":  "5.3 PROJETS INTÉGRATEURS",                             // [vérifié sc=1.35] 5.3 PROJETS INTEGRATEURS (1A INFRES)
	"302":  "5.3 UNIX",                                             // [vérifié sc=1.17] 5.3 UNIX UTILISATEURS (1A INFRES)
	"303":  "5.4 FRONTED",                                          // [vérifié sc=1.35] 5.4 FRONTED (1A INFRES)
	"304":  "5.4 LANGAGE DE DÉVELOPPEMENT ORIENTÉ OBJET",           // [vérifié sc=0.86] 5.4 LANGAGE DE DEV ORIENTE OBJETS (1A INFRES)
	"305":  "5.5 ETHICAL HACKING",                                  // [vérifié sc=1.35] 5.5 ETHICAL HACKING (1A INFRES)
	"548":  "5.5 VIRTUALISATION ET CONTENEURISATION: FONDAMENTAUX", // [vérifié sc=0.89] 5.5 VIRTUALISATION ET CONTAINERISATION (1A INFRES)
	"551":  "5.6 GESTION DE PROJET: OUTILS ET MÉTHODES",            // [vérifié sc=1.12] 5.6 GESTION DE PROJET - 1 (1A INFRES)
	"309":  "5.6 JEU D'ENTREPRISE INITIATION À LA GESTION",         // [vérifié sc=1.17] 5.6 JEU D'ENTREPRISE (1A INFRES)
	"310":  "5.7 ANGLAIS",                                          // [vérifié sc=1.35] 5.7 ANGLAIS (1A INFRES)
	"2050": "",                                                     // [absent BDD] 5.8 DPPA THÉATRE (1A INFRES)
	"1994": "5.8 MISSION1 :PROJET D'EMPLOI ",                       // [vérifié sc=1.03] 5.8 MISSION 1: PROJET D'EMPLOI (1A INFRES)
	"312":  "",                                                     // [absent BDD] 5.8 PRES. REFERENTIEL DE COMPETENCES (1A INFRES)
	"2066": "6.1.1 MATH - FONDEMENTS DE L'IA",                      // [vérifié sc=0.74] 6.1 FONDEMENTS DE L'IA (1A INFRES)
	"544":  "6.1.2 MATH - MATHEMATIQUES POUR L'INGENIEUR",          // [vérifié sc=1.35] 6.1 MATHEMATIQUES (1A INFRES)
	"545":  "6.1.3 MATH - TRAITEMENT NUMERIQUE DE L'INFORMATION",   // [vérifié sc=1.02] 6.1TRAITEMENT NUMERIQUE DE L'INFORMATION (1A INFRES)
	"1127": "6.2.2 BST - ARCHITECTURS MIDDLEWARE/TÉLÉPHONIE IP",    // [vérifié sc=0.49] 6.2 ARCHITECTURE MIDDLWARE (1A INFRES)
	"1270": "6.2.1 BST - GESTION DE VERSIONS DECENTRALISÉE",        // [vérifié sc=1.02] 6.2 GESTION DE VERSIONS DECENTRALISEE (1A INFRES)
	"1884": "6.2.2 BST - ARCHITECTURS MIDDLEWARE/TÉLÉPHONIE IP",    // [vérifié sc=0.75] 6.2 TELEPHONIE IP (1A INFRES)
	"1681": "6.3.2 ASSI - CRYPTOGRAPHIE",                           // [vérifié sc=0] 6.3 CRYPTOGRAPHIE (1A INFRES)
	"1886": "6.3.3 ASSI - GESTION DU CYLCE DE VIE DES CERTIFICATS", // [vérifié sc=0.56] 6.3 GESTION DU CYCLE DE VIE DES CERTIFIC (1A INFRES)
	"547":  "6.3.1 ASSI - RESEAUX ET PROTOCOLES -2",                // [vérifié sc=0.88] 6.3 RESEAUX ET PROTOCOLES -2 (1A INFRES)
	"307":  "6.4.2 ASSI - BASES DE DONNES : SGBDR",                 // [vérifié sc=0.81] 6.4 BASES DE DONNEES (1A INFRES)
	"549":  "6.4.1 ASSI - ORCHESTRATION DE CONTENEUR",              // [vérifié sc=0.89] 6.4 ORCHESTRATION DE CONTENEUR (1A INFRES)
	"550":  "6.5.2 PROJ - PROJET",                                  // [vérifié sc=1.02] 6.5 PROJET (1A INFRES)
	"1796": "",                                                     // [à vérifier sc=0.8] 6.5 PROJET - ANALYSE ET REDACTION CDC (1A INFRES) | candidat: 6.5 PROJ : ANALYSE FONCTIONNELLE ET REDACTION CAHIER DES CHARGES
	"553":  "6.6 LING - ANGLAIS",                                   // [vérifié sc=0.75] 6.6 ANGLAIS (1A INFRES)
	"1618": "",                                                     // [absent BDD] 6.7 CONDUITE DE REUNION (1A INFRES)
	"2088": "",                                                     // [absent BDD] 6.7 DPPA SIO (1A INFRES)
	"314":  "",                                                     // [absent BDD] 6.7 GESTION DU STRESS (1A INFRES)
	"1797": "",                                                     // [absent BDD] 6.7 TRANSITION ECOLOGIQUE ET SOCIALE (1A INFRES)

	// ┌─ 2A INFRES  (32/41 mappés) ───────────────────────────────────────────────
	"49":   "7.1.1. SR - ANALYSE DES RISQUES NUMÉRIQUES",                  // [auto·haute sc=1.35] 7.1.1. ANALYSE DES RISQUES NUMÉRIQUES (2A INFRES)
	"50":   "7.1.2. TECHNOLOGIE DES MÉDIAS",                               // [auto·haute sc=1.35] 7.1.2. TECHNOLOGIE DES MEDIAS (2A INFRES)
	"51":   "7.2.1. CRYPTOGRAPHIE ET PREUVE NUMÉRIQUE",                    // [auto·haute sc=1.07] 7.2.1. CRYPTOGRAPHIE (2A INFRES)
	"52":   "7.2.1. CRYPTOGRAPHIE ET PREUVE NUMÉRIQUE",                    // [auto·haute sc=1.19] 7.2.1. PREUVE NUMERIQUE (2A INFRES)
	"1332": "7.2.2. APPLICATIONS DE LA CRYPTOGRAPHIE",                     // [auto·haute sc=1.35] 7.2.2. APPLICATIONS DE LA CRYPTOGRAPHIE (2A INFRES)
	"1808": "7.2.3. DL - INFRASTRUCTURE AS CODE",                          // [auto·haute sc=1.35] 7.2.3. DL INFRASTRUCTURE AS CODE (2A INFRES)
	"1809": "7.2.3. SR - INFRASTRUCTURE : OPEN STACK",                     // [auto·moyenne sc=1.03] 7.2.3. SR INFRASTRUCURE : OPEN STACK (2A INFRES)
	"55":   "7.3.1. DL - VALIDATION DES LOGICIELS",                        // [auto·haute sc=1.35] 7.3.1. DL VALIDATION DES LOGICIELS (2A INFRES)
	"54":   "7.3.1. SR - INTÉGRATION ET DÉPLOIEMENT CONTINUS",             // [auto·moyenne sc=1.01] 7.3.1. SR INTÉ DÉPLOIEMENT CONTINUS (2A INFRES)
	"1810": "7.3.2. DL - BONNES PRATIQUES DE PRODUCTION DE CODE",          // [auto·moyenne sc=0.86] 7.3.2. DL BONNES PRAT DE PROD DE CODE (2A INFRES)
	"53":   "7.3.2. SR - SERVICE D'ANNUAIRE WINDOWS",                      // [auto·haute sc=1.35] 7.3.2. SR SERVICE D'ANNUAIRE WINDOWS (2A INFRES)
	"57":   "",                                                            // [à vérifier sc=0.73] 7.4.1. DL ARCHI LOG : MICROSERVICES 1 (2A INFRES) | candidat: 7.4.1. DL - ARCHITECTURE LOGICIELLE : MICROSERVICES - 1
	"1538": "7.4.1. SR - RÉSEAUX AVANCÉS",                                 // [auto·haute sc=1.35] 7.4.1. SR RÉSEAUX AVANCÉS (2A INFRES)
	"58":   "7.4.2. DL - INTEGRATION ET DÉPLOIEMENT CONTINUS",             // [auto·moyenne sc=1.01] 7.4.2. DL INTÉ DEPLOIEMENT CONTINUS (2A INFRES)
	"59":   "",                                                            // [à vérifier sc=0.76] 7.4.2. SR ADMNISTRATION DES SERV RÉSEAUX (2A INFRES) | candidat: 7.4.2. SR - ADMINISTRATION DES SERVICES RÉSEAUX
	"60":   "7.5.1. GESTION DE PROJET : ATELIERS ÉLECTIFS",                // [auto·haute sc=1.35] 7.5.1. GESTION PROJET/ATELIERS ELECTIFS (2A INFRES)
	"61":   "7.5.2. DROIT SOCIAL ET SPECIFIQUE AU METIER",                 // [auto·haute sc=1.08] 7.5.2. DROIT SOCIAL ET SPECIFIQUE INFO (2A INFRES)
	"62":   "",                                                            // [à vérifier sc=0.46] 7.6 LANGUES VIVANTES (2A INFRES) | candidat: 7.6. ANGLAIS OU AUTRE LANGUE VIVANTE
	"63":   "FCD 8.3 - COMMUNICATION ÉCRITE",                              // [auto·moyenne sc=1.0] 7.7 DPPA / COMMUNICATION ECRITE (2A INFRES)
	"1568": "DEVELOPPEMENT PERSONNEL",                                     // [auto·moyenne sc=1.0] 7.7 DPPA / DEVELOPPEMENT PERSONNEL (2A INFRES)
	"1692": "",                                                            // [à vérifier sc=0.53] 7.7 DPPA / FRESQUE DU NUMERIQUE (2A INFRES) | candidat: 7.2 INFRES-ASSI PREUVE NUMÉRIQUE
	"1691": "",                                                            // [à vérifier sc=0.47] 7.7 DPPA / INCLUSION (2A INFRES) | candidat: 7.7-MKX-DPPA- MISSION 3 -
	"66":   "8.1.A. DL - INFORMATIQUE MOBILE : ANDROÏD",                   // [auto·haute sc=1.35] 8.1 / A DL INFORMATIQUE MOBILE : ANDROID (2A INFRES)
	"67":   "8.1.A. DL - SYSTÈMES EMBARQUÉS ET I.O.T.",                    // [auto·haute sc=1.35] 8.1 / A DL SYSTÈMES EMBARQUÉS ET I.O.T (2A INFRES)
	"1811": "8.1.B. DL - MODÉLISATIONS ET RÉSOLUTIONS DE PBM À BASE D'IA", // [auto·moyenne sc=0.96] 8.1 / B MODÉLISATION RÉSOLUTIONS DE PBM (2A INFRES)
	"1812": "8.1.B. DL - OPTIMISATION DE CODE",                            // [auto·haute sc=1.35] 8.1 / B OPTIMISATION DE CODE (2A INFRES)
	"70":   "8.1.1. LANGAGE DE SCRIPT",                                    // [auto·haute sc=1.35] 8.1.1. SR LANGAGE DE SCRIPT (2A INFRES)
	"71":   "8.1.2. SR ADMINISTRATION SYSTEME : LINUX",                    // [auto·haute sc=1.35] 8.1.2. SR ADMINISTRATION SYSTEME : LINUX (2A INFRES)
	"1539": "8.1.3. SR - INFRASTRUCTURE AS CODE",                          // [auto·haute sc=1.35] 8.1.3. SR INFRASTRUCTURE AS CODE (2A INFRES)
	"69":   "",                                                            // [à vérifier sc=0.73] 8.2.1. DL ARCHI. LOGI : MICROSERVICES 2 (2A INFRES) | candidat: 8.2.1. DL - ARCHITECTURE LOGICIELLE : MICROSERVICES 2
	"73":   "",                                                            // [à vérifier sc=0.65] 8.2.1. SR SÉCU DES RSX : OUTILS ET ÉQUIP (2A INFRES) | candidat: 8.2.1. SR - SÉCURITÉ DES RÉSEAUX : OUTILS ET ÉQUIPEMENTS DÉDIÉS
	"68":   "8.2.2. DL - MÉTROLOGIE",                                      // [auto·haute sc=1.35] 8.2.2. DL METROLOGIE (2A INFRES)
	"75":   "8.2.2. SR - SUPERVISION ET GESTION DES RÉSEAUX",              // [auto·moyenne sc=1.02] 8.2.2. SR SUPERVISION ET GESTION DES RSX (2A INFRES)
	"76":   "8.3.1. SCRUM MASTER",                                         // [auto·haute sc=1.35] 8.3.1. SCRUM MASTER (2A INFRES)
	"65":   "8.3.2. INITIATION À LA RECHERCHE",                            // [auto·haute sc=1.35] 8.3.2. INITIATION A LA RECHERCHE (2A INFRES)
	"1459": "8.3.3. PROJET FIL ROUGE OU PROJET RECHERCHE",                 // [auto·haute sc=1.33] 8.3.3. PROJET FIL ROUGE/ RECHERCHE-1 (2A INFRES)
	"1540": "8.4.1. MANAGEMENT ENTREPRISE ET ÉQUIPE",                      // [auto·haute sc=1.35] 8.4.1. MANAGEMENT ENTREPRISE ET EQUIPE (2A INFRES)
	"80":   "8.4.2. QUALITÉ",                                              // [auto·haute sc=1.35] 8.4.2. QUALITE (2A INFRES)
	"1574": "",                                                            // [à vérifier] 8.6 DPPA / DVLPMT COMPETENCES INTERCULT. (2A INFRES)
	"82":   "",                                                            // [à vérifier] 8.6 DPPA / GESTION DU TPS / ORG. PERS. (2A INFRES)
	"1813": "ECONOMIE CIRCULAIRE",                                         // [auto·moyenne sc=1.0] 8.6 DPPA / ÉCONOMIE CIRCULAIRE (2A INFRES)

	// ┌─ 3A INFRES DL  (7/12 mappés) ────────────────────────────────────────────
	"2044": "",                                                           // [à vérifier sc=0.67] 9. TRAVAIL PERSONNEL (3A INFRES DL) | candidat: 9.5-CMC-PR(PERS) PROJET PERSONNEL
	"88":   "",                                                           // [à vérifier sc=0.54] 9.2.1. FRONTED (3A INFRES DL) | candidat: 9.2.1. DL - FRONTEND
	"84":   "9.2.2. DL - ENVIRONNEMENT ASP.NET",                          // [auto·haute sc=1.11] 9.2.2. ENVIRONNEMENT ASP.NET MICROSOFT (3A INFRES DL)
	"1960": "",                                                           // [à vérifier sc=0.7] 9.2.3. IA : APPRENTISAGE PROFOND (3A INFRES DL) | candidat: 9.2.3. INTELLIGENCE ARTIFICIELLE : APPRENTISSAGE PROFOND
	"91":   "",                                                           // [à vérifier sc=0.76] 9.3.1. COURS GEST DES DEP, RISQUES ET MA (3A INFRES DL) | candidat: 9.3.1. DL - COURS GESTION DES DÉPENDANCES, RISQUES ET MAINTENABILITÉ
	"92":   "9.3.2. DL - EXPÉRIENCE UTILISATEUR : UX ET UI DESIGN",       // [auto·moyenne sc=0.93] 9.3.2. EXP. UTILI : UX ET UI DESIGN (3A INFRES DL)
	"89":   "9.2.2. DL BASES DE DONNÉES NOSQL",                           // [auto·moyenne sc=1.04] 9.4.1. BASES DE DONNEES NOSQL (3A INFRES DL)
	"90":   "9.4.2. DL - BIG DATA ET MODÉLISATION",                       // [auto·haute sc=1.35] 9.4.2. BIG DATA ET MODELISATION (3A INFRES DL)
	"1963": "9.5.2. DL - FUNCTION & BACK-END AS A SERVICE : FAAS & BAAS", // [auto·moyenne sc=0.98] 9.5.2. FUNCT - BACK-END AS A SERV :FAAS- (3A INFRES DL)
	"96":   "",                                                           // [à vérifier sc=0.76] 9.6.1. CREA D'ENTREPRISE ET D'ACTIVITE (3A INFRES DL) | candidat: 9.6.1. CRÉATION D'ENTREPRISE ET D'ACTIVITÉS
	"1961": "9.6.2. QUALITÉS DES SERVICES INFORMATIQUES : ITIL",          // [auto·moyenne sc=0.86] 9.6.2. QUALITES DES SERV. INFO : ITIL (3A INFRES DL)
	"93":   "9.6.3. PROJET FIL ROUGE OU PROJET RECHERCHE",                // [auto·haute sc=1.07] 9.6.3 PROJET FIL ROUGE/PROJ. RECHERCHE 2 (3A INFRES DL)

	// ┌─ 3A INFRES SR  (10/10 mappés) ────────────────────────────────────────────
	"100":  "9.2.1. SR - GESTION DE PARC",                                 // [auto·haute sc=1.35] 9.2.1. GESTION DE PARC (3A INFRES SR)
	"1965": "9.2.2. SR - MICROSERVICES",                                   // [auto·moyenne sc=1.04] 9.2.3. MICROSERVICES (3A INFRES SR)
	"105":  "9.3.1. SR- VIRTUALISATION DE STOCKAGE",                       // [auto·haute sc=1.35] 9.3.1. VIRTUALISATION DE STOCKAGE (3A INFRES SR)
	"106":  "9.3.2. SR - GESTION ET TRAITEMENT DES DONNEES INFORMATIQUES", // [auto·haute sc=1.23] 9.3.2. GESTION ET TRAITEMENT DES DONNEES (3A INFRES SR)
	"107":  "9.4.1. SR - RÉSEAUX MOBILES ET IOT",                          // [auto·haute sc=1.35] 9.4.1. RESEAUX MOBILES ET IOT (3A INFRES SR)
	"1001": "9.4.2. SR - RÉSEAUX WIFI",                                    // [auto·haute sc=1.35] 9.4.2. RESEAUX WIFI (3A INFRES SR)
	"1152": "9.5.2. SR -  AUTOMATISATION RÉSEAUX",                         // [auto·haute sc=1.35] 9.5.2. AUTOMATISATION RESEAUX (3A INFRES SR)
	"1964": "9.5.3. SR - FORENSICS ET PREUVES NUMÉRIQUES",                 // [auto·moyenne sc=1.0] 9.5.3. FORENSICS ET PREUVES NUM (3A INFRES SR)
	"1967": "9.6.2. QUALITÉS DES SERVICES INFORMATIQUES : ITIL",           // [auto·haute sc=1.08] 9.6.2. QUALITES DES SERVICES INFO : ITIL (3A INFRES SR)
	"109":  "9.6.3. PROJET FIL ROUGE OU PROJET RECHERCHE",                 // [auto·haute sc=1.07] 9.6.3 PROJET FIL ROUGE/PROJ.RECHERCHE 2 (3A INFRES SR)

	// ┌─ 1A BAT+MKX  (43/87 mappés) ──────────────────────────────────────────────
	"319":  "5.1-ALGEBRE",                                                 // [auto·moyenne sc=1.0] ALGEBRE (1A BAT+MKX)
	"2046": "5.1-ALGEBRE",                                                 // [auto·moyenne sc=1.0] ALGEBRE BAT (1A BAT+MKX)
	"2086": "5.1-ALGEBRE",                                                 // [auto·moyenne sc=1.0] ALGEBRE MKX (1A BAT+MKX)
	"318":  "5.1-ANALYSE-1",                                               // [auto·moyenne sc=1.0] ANALYSE -1 (1A BAT+MKX)
	"2045": "5.1-ANALYSE-1",                                               // [auto·moyenne sc=1.0] ANALYSE 1-1 BAT (1A BAT+MKX)
	"342":  "6.5-ANALYSE ARCHITECTURALE DU BATIMENT EXISTANT",             // [auto·moyenne sc=1.0] ANALYSE ARCHITECTURALE BATIMENT EXISTANT (1A BAT+MKX)
	"333":  "ANALYSE NUMERIQUE",                                           // [auto·moyenne sc=1.0] ANALYSE NUMERIQUE (1A BAT+MKX)
	"332":  "5.1-ANALYSE-1",                                               // [auto·moyenne sc=1.0] ANALYSE- 2 (1A BAT+MKX)
	"1981": "",                                                            // [événement] ASSOCIATION CYBORG BULLS (1A BAT+MKX)
	"347":  "5.3-AUTOMATIQUE-1",                                           // [auto·moyenne sc=1.0] AUTOMATIQUE- 1 (1A BAT+MKX)
	"1902": "",                                                            // [événement] AUTONOMIE (1A BAT+MKX)
	"326":  "5.4-BASES DU PROJET DE CONSTRUCTION",                         // [auto·moyenne sc=1.0] BASES DU PROJET DE CONSTRUCTION (1A BAT+MKX)
	"1800": "",                                                            // [événement] CHALLENGE IMT GO (1A BAT+MKX)
	"352":  "6.3-CONCEPTION ASSISTEE PAR ORDINATEUR",                      // [auto·moyenne sc=1.0] CONCEPTION ASSISTEE PAR ORDINATEUR (1A BAT+MKX)
	"1350": "",                                                            // [événement] CONFERENCE (1A BAT+MKX)
	"346":  "5.2-CONSTRUCTION MECANIQUE INDUSTRIELLE",                     // [auto·moyenne sc=1.0] CONSTRUCTION MECANIQUE INDUSTRIELLE (1A BAT+MKX)
	"1990": "EE-DEVENIR INGENIEUR",                                        // [auto·moyenne sc=1.0] DEVENIR INGENIEUR (1A BAT+MKX)
	"834":  "",                                                            // [à vérifier] DPPA (1A BAT+MKX)
	"2074": "",                                                            // [événement] DPPA BAT 1A CONDUITE DE REUNION (1A BAT+MKX)
	"2072": "",                                                            // [à vérifier] DPPA BAT 1A THEATRE (1A BAT+MKX)
	"2076": "",                                                            // [à vérifier] DPPA BAT 1A TRANSITION ECOLO ET SOCIALE (1A BAT+MKX)
	"2080": "",                                                            // [à vérifier] DPPA BAT REFERENTIEL DE COMPETENCES (1A BAT+MKX)
	"2081": "",                                                            // [événement] DPPA GESTION DU STRESS BAT (1A BAT+MKX)
	"2082": "",                                                            // [événement] DPPA GESTION DU STRESS MKX (1A BAT+MKX)
	"1276": "",                                                            // [à vérifier sc=0.54] DPPA M1S/M2 RESPONSABILITE SOCIETALE (1A BAT+MKX) | candidat: 6.8 DPPA : MISSION 2 - RESPONSABILITE SOCIETALE
	"2075": "",                                                            // [événement] DPPA MKX CONDUITE DE REUNION (1A BAT+MKX)
	"2079": "",                                                            // [à vérifier sc=0.66] DPPA MKX GESTION DE L'INFORMATION (1A BAT+MKX) | candidat: GITN - 9.4.2 - SYSTEME D'INFORMATION POUR L'ENTREPRISE (ERP) ET GESTION DE LA CHAINE LOGISTIQUE (SCM)
	"2078": "",                                                            // [à vérifier] DPPA MKX REFERENTIEL DE COMPETENCES (1A BAT+MKX)
	"2073": "",                                                            // [à vérifier] DPPA MKX THEATRE (1A BAT+MKX)
	"381":  "",                                                            // [événement] DPPA PRESENTATION (1A BAT+MKX)
	"348":  "5.3-ELECTRONIQUE",                                            // [auto·moyenne sc=1.0] ELECTRONIQUE (1A BAT+MKX)
	"349":  "5.3-ELECTROTECHNIQUE",                                        // [auto·moyenne sc=1.0] ELECTROTECHNIQUE (1A BAT+MKX)
	"1991": "",                                                            // [à vérifier] ENQUETE ADMISSION (1A BAT+MKX)
	"327":  "5.4-EXCEL,PROGRAMMATION VBA, MS PROJECT",                     // [auto·moyenne sc=1.0] EXCEL PROGRAMMATION VBA MS PROJECT (1A BAT+MKX)
	"2039": "6.1.1 MATH - FONDEMENTS DE L'IA",                             // [auto·moyenne sc=1.0] FONDEMENTS DE L'IA (1A BAT+MKX)
	"1600": "",                                                            // [à vérifier sc=0.66] GESTION DE L'INFORMATION (1A BAT+MKX) | candidat: GITN - 9.4.2 - SYSTEME D'INFORMATION POUR L'ENTREPRISE (ERP) ET GESTION DE LA CHAINE LOGISTIQUE (SCM)
	"1349": "5.5-GESTION DE PROJET OUTILS ET METHODES",                    // [auto·moyenne sc=1.0] GESTION PROJET OUTILS METHODES (1A BAT+MKX)
	"1325": "",                                                            // [à vérifier sc=0.72] HARMONISATION MATH (1A BAT+MKX) | candidat: UNIX UTILISATEUR - HARMONISATION SR
	"1979": "",                                                            // [à vérifier sc=0.52] INFOS SECURITE ETSECURITE INFORMATIQUE (1A BAT+MKX) | candidat: SECURITE DE SI - DROIT INFORMATIQUE
	"1430": "",                                                            // [à vérifier sc=0.55] INGENERIE DES ARCHITECTURES (1A BAT+MKX) | candidat: 6.4-INGENIERIE DES ARCHITECTURES
	"1647": "",                                                            // [à vérifier sc=0.54] INGENERIE DES EXIGENCES (1A BAT+MKX) | candidat: 6.4-INGENIERIE DES EXIGENCES
	"2087": "6.4-INGENIERIE DES EXIGENCES : APPLICATION PROJET FIL ROUGE", // [auto·moyenne sc=0.85] INGENIERIE EXIGENCES : FIL ROUGE (1A BAT+MKX)
	"1322": "",                                                            // [à vérifier sc=0.84] INGENIERIE SYSTEME PRINCIPES ANALYSE (1A BAT+MKX) | candidat: 5.4-INGENIERIE SYSTEME PRINCIPES ANALYSE DE MISSION ET INGENIERIE DES EXIGENCES
	"2000": "",                                                            // [à vérifier sc=0.64] INITIATION LOGICIEL (1A BAT+MKX) | candidat: 9.4.3 IL INITIATION A LA RECHERCHE EN GENIE LOGICIEL / INITIATION TO RESEARCH IN SOFTWARE ENGINEERING
	"2077": "",                                                            // [à vérifier] INITIATION LOGICIEL MATLAB ET  SIMULINK (1A BAT+MKX)
	"1683": "5.5-JEU D'ENTREPRISE",                                        // [auto·moyenne sc=1.0] JEU D'ENTREPRISE (1A BAT+MKX)
	"341":  "6.5-ENVELOPPE DU BATIMENT",                                   // [auto·moyenne sc=1.0] L'ENVELOPPE DU BATIMENT (1A BAT+MKX)
	"1129": "",                                                            // [à vérifier sc=0.68] LANGAGE DE PROGRAMMATION ET ALGORITHMIQU (1A BAT+MKX) | candidat: 6.2-LANGAGE DE PROGRAMMATION ET ALGORITHMIQUE
	"323":  "MECANIQUE DES FLUIDES",                                       // [auto·moyenne sc=1.0] MECANIQUE DES FLUIDES (1A BAT+MKX)
	"321":  "5.2-MECANIQUE DES MILIEUX CONTINUS",                          // [auto·moyenne sc=1.0] MECANIQUE DES MILIEUX CONTINUS (1A BAT+MKX)
	"320":  "6.3-MECANIQUE GENERALE - 1",                                  // [auto·moyenne sc=1.0] MECANIQUE GENERALE (1A BAT+MKX)
	"2047": "6.3-MECANIQUE GENERALE - 1",                                  // [auto·moyenne sc=1.0] MECANIQUE GENERALE BAT (1A BAT+MKX)
	"2085": "6.3-MECANIQUE GENERALE - 1",                                  // [auto·moyenne sc=1.0] MECANIQUE GENERALE MKX (1A BAT+MKX)
	"1192": "",                                                            // [à vérifier] MISE EN ROUTE DES TABLETTES (1A BAT+MKX)
	"1274": "6.3-MODELISATION DE STRUCTURES",                              // [auto·moyenne sc=1.0] MODELISATION DE STRUCTURES (1A BAT+MKX)
	"1988": "",                                                            // [à vérifier] MUR DE REPONSE (1A BAT+MKX)
	"1131": "6.5-OUTIL DE CAO ET DE BIM",                                  // [auto·moyenne sc=1.0] OUTIL DE CAO ET BIM (1A BAT+MKX)
	"1589": "",                                                            // [à vérifier sc=0.46] PAS D'ENSEIGNEMENT (1A BAT+MKX) | candidat: MKX 10.2 ENSEIGNEMENT ELECTIF (LINUX, ANDROID, LABVIEW)
	"2002": "",                                                            // [à vérifier] POINT COMMUNICATION FUTUR CANDIDAT (1A BAT+MKX)
	"1987": "",                                                            // [à vérifier] PRES- ASSIST. SOCIALE ET PSYCHOLOGIQUE (1A BAT+MKX)
	"2068": "",                                                            // [à vérifier] PRES. VALORISATION PARCOURS ETUDIANT (1A BAT+MKX)
	"1859": "",                                                            // [événement] PRESENTATION DU SIO (1A BAT+MKX)
	"1978": "",                                                            // [événement] PRESENTATION VIE A L'ECOLE (1A BAT+MKX)
	"1314": "5.4-PRINCIPES ET OUTIL DE PERFORMANCE INDUSTRIELLE",          // [auto·moyenne sc=1.0] PRINCIPES OUTIL PERFORMANCE INDUSTRIELLE (1A BAT+MKX)
	"1125": "5.1-PROBABILITES ET STATISTIQUES",                            // [auto·moyenne sc=1.0] PROBABILITES ET STATISTIQUES (1A BAT+MKX)
	"1654": "6.5-PROJET D'INITIATION : SYSTEME MECATRONIQUE",              // [auto·moyenne sc=1.0] PROJET D'INITIATION SYSTEME MECATRONIQUE (1A BAT+MKX)
	"1431": "8.5-MKX-PROJ-PROJET FIL ROUGE",                               // [auto·moyenne sc=1.0] PROJET FIL ROUGE V V (1A BAT+MKX)
	"2004": "",                                                            // [événement] RENCONTRE  EQUIPE DPPA (1A BAT+MKX)
	"691":  "",                                                            // [événement] RENCONTRE APPRENTI/TUTEUR (1A BAT+MKX)
	"2014": "",                                                            // [événement] RENCONTRE AVEC LE BDA (1A BAT+MKX)
	"2006": "",                                                            // [événement] RENCONTRE AVEC LE BUREAU DES SPORTS (1A BAT+MKX)
	"2021": "",                                                            // [événement] RENCONTRE AVEC LE DEPARTEMENT (1A BAT+MKX)
	"2100": "",                                                            // [événement] RENCONTRE SERVICE PEDAGOGIQUE (1A BAT+MKX)
	"334":  "6.2-RESEAUX SECS ET HUMIDES",                                 // [auto·moyenne sc=1.0] RESEAUX SECS ET HUMIDES (1A BAT+MKX)
	"2028": "5.2-RESISTANCE DES MATERIAUX",                                // [auto·moyenne sc=1.0] RESISTANCE DES MATERIAUX (1A BAT+MKX)
	"322":  "5.2-RESISTANCE DES MATERIAUX",                                // [auto·moyenne sc=1.0] RESISTANCE DES MATERIAUX -1 (1A BAT+MKX)
	"337":  "5.2-RESISTANCE DES MATERIAUX",                                // [auto·moyenne sc=1.0] RESISTANCE DES MATERIAUX- 2 (1A BAT+MKX)
	"1224": "",                                                            // [à vérifier sc=0.53] REX 1A (1A BAT+MKX) | candidat: REX
	"328":  "",                                                            // [événement] SEMINAIRE CREATIVITE (1A BAT+MKX)
	"1107": "SOUTENANCES",                                                 // [auto·moyenne sc=1.0] SOUTENANCES IS (1A BAT+MKX)
	"340":  "6.4-THERMIQUE DU BATIMENT",                                   // [auto·moyenne sc=1.0] THERMIQUE DU BATIMENT (1A BAT+MKX)
	"324":  "FCD 7.6 - THERMODYNAMIQUE",                                   // [auto·moyenne sc=1.0] THERMODYNAMIQUE (1A BAT+MKX)
	"397":  "",                                                            // [à vérifier sc=0.58] THERMODYNAMIQUE TD (1A BAT+MKX) | candidat: FCD 7.6 - THERMODYNAMIQUE
	"2026": "TRAITEMENT DU SIGNAL",                                        // [auto·moyenne sc=1.0] TRAITEMENT DU SIGNAL (1A BAT+MKX)
	"325":  "8.1-STM-TRANSFERTS THERMIQUES",                               // [auto·moyenne sc=1.0] TRANSFERTS THERMIQUES -1 (1A BAT+MKX)
	"339":  "8.1-STM-TRANSFERTS THERMIQUES",                               // [auto·moyenne sc=1.0] TRANSFERTS THERMIQUES- 2 (1A BAT+MKX)
	"335":  "6.2-VOIRIES",                                                 // [auto·moyenne sc=1.0] VOIRIES (1A BAT+MKX)

	// ┌─ 1A FISE  (26/44 mappés) ─────────────────────────────────────────────────
	"1912": "5.1-PROBABILITES ET STATISTIQUES",   // [auto·moyenne sc=1.0] 5.1.1 /  PROBABILITES (1A FISE)
	"1913": "5.1 PROBABIITÉS ET STATISTIQUES",    // [auto·moyenne sc=1.02] 5.1.2 / STATISTIQUES (1A FISE)
	"2102": "",                                   // [à vérifier sc=0.45] 5.2.1 INGENIERIE LOGICIELLE (1A FISE) | candidat: INGÉNIERIE LOGICIELLE - CAS D'ÉTUDES
	"1914": "",                                   // [à vérifier] 5.2.2 / A.P.O (1A FISE)
	"1915": "RESEAU",                             // [auto·moyenne sc=1.0] 5.2.2 / RESEAU (1A FISE)
	"1916": "",                                   // [à vérifier] 5.2.3 / B.D.R. (1A FISE)
	"34":   "",                                   // [à vérifier sc=0.57] 5.2.4 / OUTILS D'ANALYSE (1A FISE) | candidat: 5.1-ANALYSE-1
	"5":    "MATERIAUX DE L'INGENIEUR I - CE",    // [auto·moyenne sc=0.89] 5.3 / MATERIAUX POUR L'INGENIEUR (1A FISE)
	"1919": "CMI",                                // [auto·moyenne sc=1.0] 5.4.1 / CMI (1A FISE)
	"1920": "MMC -",                              // [auto·moyenne sc=1.0] 5.4.2 / MMC (1A FISE)
	"1921": "RDM",                                // [auto·moyenne sc=1.0] 5.4.3 / RDM (1A FISE)
	"7":    "GESTION D'ENTREPRISE",               // [auto·moyenne sc=1.0] 5.5.1 / GESTION ENTREPRISE (1A FISE)
	"1924": "TC-5.5 DROIT EN ENTREPRISE -",       // [auto·moyenne sc=0.88] 5.5.2 / DROIT EN ENTREPRISE (1A FISE)
	"1925": "TC-5.5 PRODUCTION GLOBALISEE -",     // [auto·moyenne sc=0.89] 5.5.3 / PRODUCTION GLOBALISEE (1A FISE)
	"1926": "MANAGEMENT RH",                      // [auto·moyenne sc=1.0] 5.5.4 / MANAGEMENT RH (1A FISE)
	"1927": "ETHIQUE",                            // [auto·moyenne sc=1.0] 5.6.1 / ETHIQUE (1A FISE)
	"1928": "",                                   // [à vérifier sc=0.8] 5.6.2 / RECI (1A FISE) | candidat: TC-5.6 RECI -
	"1929": "LV2",                                // [auto·moyenne sc=1.0] 5.7.1 / LV2 (1A FISE)
	"1930": "5.7 LING : ANGLAIS",                 // [auto·haute sc=1.22] 5.7.2 / ANGLAIS (1A FISE)
	"1931": "",                                   // [à vérifier sc=0.52] 6.1.1 / TRAIT. DU SIGNAL (1A FISE) | candidat: TRAITEMENT DU SIGNAL
	"1932": "",                                   // [à vérifier sc=0.78] 6.1.2 / CAN (1A FISE) | candidat: TC-6.1 CAN -
	"1933": "6.4-STM-AUTOMATIQUE (PARTIE2)",      // [auto·moyenne sc=1.04] 6.1.3 / AUTOMATIQUE (1A FISE)
	"1590": "ENERGIE",                            // [auto·moyenne sc=1.0] 6.2 / ENERGIE (1A FISE)
	"2031": "",                                   // [à vérifier sc=0.83] 6.3.1 / INTELLIGENCE ARTIFICIELLE (1A FISE) | candidat: SYM- 10.1.1 INTELLIGENCE ARTIFICIELLE
	"2038": "CYBERSECURITE",                      // [auto·moyenne sc=1.0] 6.3.2 / CYBERSECURITE (1A FISE)
	"1941": "TC-6.4 BUSINESS MODEL -",            // [auto·moyenne sc=0.88] 6.4.1 / BUSINESS MODEL (1A FISE)
	"2064": "",                                   // [à vérifier sc=0.51] 6.4.2 / ANALYSE FONCTIONELLE - CC - PI (1A FISE) | candidat: 6.5.1 PROJ - ANALYSE FONCTIONELLE ET REDACTION DE CAHIER DES CHARGES
	"1940": "TC-6.4 MARKETING & ETUDE DE MARCHE", // [auto·moyenne sc=0.91] 6.4.3 / MARKETING   ETUDE DE MARCHE (1A FISE)
	"1939": "TC-6.4 OUTILS FINANCIERS -",         // [auto·moyenne sc=0.88] 6.4.4 / OUTILS FINANCIERS (1A FISE)
	"1942": "INTELLIGENCE ECONOMIQUE",            // [auto·moyenne sc=1.0] 6.4.5 / INTELLIGENCE ECONOMIQUE (1A FISE)
	"2043": "6.6-GESTION DE PROJET - 2",          // [auto·moyenne sc=1.04] 6.4.6 / GESTION DE PROJET (1A FISE)
	"2051": "",                                   // [à vérifier sc=0.57] 6.6.1 / UEE ARCHITECTURE (1A FISE) | candidat: ARCHITECTURE DES SI
	"2052": "",                                   // [à vérifier] 6.6.2 / UEE BIOLOGIE (1A FISE)
	"2053": "",                                   // [à vérifier] 6.6.3 / UEE CAPTEURS - IA (1A FISE)
	"2054": "",                                   // [à vérifier] 6.6.4 / UEE CONCEPTION MECANIQUE (1A FISE)
	"2055": "",                                   // [à vérifier sc=0.48] 6.6.5 / UEE ECO--CONCEPTION MATERIAUX (1A FISE) | candidat: M8.4 ECO-CONCEPTION ET ECO-DESIGN
	"2056": "",                                   // [à vérifier] 6.6.6 / UEE ENERGIE SOCIETES INDUSTR. (1A FISE)
	"2058": "",                                   // [à vérifier sc=0.57] 6.6.7 / UEE MATHEMATIQUES (1A FISE) | candidat: MATHEMATIQUES
	"2060": "",                                   // [à vérifier sc=0.59] 6.6.8 / UEE PHYSIQUE NUCLEAIRE (1A FISE) | candidat: TC-6-6 UE ELECTIVE PHYSIQUE NUCLEAIRE
	"2062": "",                                   // [à vérifier] 6.6.9 / UEE SOUS-SOL ET AVENIR (1A FISE)
	"858":  "LV2",                                // [auto·moyenne sc=1.0] 6.7.1 / LV2 (1A FISE)
	"859":  "6.7-ANGLAIS",                        // [auto·haute sc=1.22] 6.7.2 / ANGLAIS (1A FISE)
	"1945": "FCD 8.4 - MISSION DE TERRAIN",       // [auto·moyenne sc=1.0] 6.8.1 / MISSION DE TERRAIN (1A FISE)
	"1229": "CREATIVITE",                         // [auto·moyenne sc=1.0] 6.8.2 / CREATIVITE (1A FISE)

	// ┌─ 2A 2IA  (16/19 mappés) ──────────────────────────────────────────────────
	"1579": "",                                                                                                               // [à vérifier sc=0.52] FRESQUE NUMERIQUE (2A 2IA) | candidat: PREUVE NUMERIQUE (7.2 ASSI)
	"913":  "",                                                                                                               // [à vérifier sc=0.82] MISSIONS R&D (2A 2IA) | candidat: MISSIONS M2
	"890":  "",                                                                                                               // [événement] PRESENTATION MISSIONS (2A 2IA)
	"434":  "8.1.1 COLLECTE DES DONNEES/DATA/COLLECTION",                                                                     // [auto·haute sc=1.12] 8.1.1 COLLECTE DES DONNEES (2A 2IA)
	"435":  "8.1.2 VALIDATION, VISUALISATION, RESTITUTION / VALIDATION, VISUALISATION, REPORTING",                            // [auto·moyenne sc=0.9] 8.1.2 VALIDATION, VISUALISATION, RESTITU (2A 2IA)
	"1723": "8.1.3 PROJET / PROJECT",                                                                                         // [auto·haute sc=1.09] 8.1.3 PROJET (2A 2IA)
	"436":  "8.2.1 INTRODUCTION A L'INFORMATIQUE THEORIQUE / INTRODUCTION TO THEORETICAL COMPUTER SCIENCE",                   // [auto·moyenne sc=0.85] 8.2.1 INTRODUCTION A L'INFORMATIQUE THEO (2A 2IA)
	"471":  "8.2.2 PROGRAMMATION C / C PROGRAMMING ",                                                                         // [auto·haute sc=1.13] 8.2.2 C PROGRAMMING (2A 2IA)
	"437":  "8.2.2 PROGRAMMATION C / C PROGRAMMING ",                                                                         // [auto·haute sc=1.12] 8.2.2 PROGRAMMATION C (2A 2IA)
	"438":  "8.2.3 COMPLEXITE DES ALGORITHMES ET RECURSIVITE / ALGORITHMIC COMPLEXITY AND RECURSIVITY",                       // [auto·moyenne sc=0.86] 8.2.3 COMPLEXITE DES ALGORITHMES - RECUR (2A 2IA)
	"439":  "8.3.1 PANORAMA DE L'IA : DEFINITION, ENJEUX ET CHALLENGES / OVERVIEW OF AI : DEFINITION, ISSUES AND CHALLENGES", // [auto·moyenne sc=0.97] 8.3.1 PANORAMA IA:DEFINITION,ENJEUX,CHAL (2A 2IA)
	"440":  "8.3.2 INTRODUCTION A L'IA SYMBOLIQUE / INTRODUCTION TO SYMBOLIC AI",                                             // [auto·haute sc=1.1] 8.3.2 INTRODUCTION IA SYMBOLIQUE (2A 2IA)
	"441":  "8.3.3 INTRODUCTION A L'APPRENTISSAGE AUTOMATIQUE / INTRODUCTION TO MACHINE LEARNING",                            // [auto·moyenne sc=0.88] 8.3.3 INTRODUCTION A APPRENTISSAGE AUTO (2A 2IA)
	"442":  "8.4.1 INGENIERIE DES EXIGENCES / REQUIREMENT ENGINEERING",                                                       // [auto·haute sc=1.12] 8.4.1 INGENIERIE DES EXIGENCES (2A 2IA)
	"477":  "8.4.2 CONCEPTION DES LOGICIELS / SOFTWARE DESIGN",                                                               // [auto·haute sc=1.14] 8.4.2 CONCEPTION DES LOGICIELS (2A 2IA)
	"1725": "8.4.3 SPECIFICATION FORMELLE / FORMAL SPECIFICATION",                                                            // [auto·haute sc=1.13] 8.4.3 SPECIFICATION FORMELLE (2A 2IA)
	"883":  "8.4.4 CAS D'ETUDE / CASE STUDY",                                                                                 // [auto·moyenne sc=1.05] 8.4.4 CAS D'ETUDE (2A 2IA)
	"448":  "8.5.1 BASES DE DONNEES AVANCEES / ADVANCED DATABASES",                                                           // [auto·haute sc=1.16] 8.5.1 BASES DE DONNEES AVANCEES (2A 2IA)
	"449":  "8.5.2 TECHNOLOGIES WEB / WEB TECHNOLOGIES ",                                                                     // [auto·haute sc=1.17] 8.5.2 TECHNOLOGIES WEB (2A 2IA)

	// ┌─ 2A ECOMAP  (14/16 mappés) ───────────────────────────────────────────────
	"1263": "8.2 - ALLIAGES POLYMÈRES",                 // [auto·moyenne sc=1.0] ALLIAGES POLYMERES (2A ECOMAP)
	"971":  "8.1 - BÉTONS",                             // [auto·moyenne sc=1.0] BETONS (2A ECOMAP)
	"1079": "CAO",                                      // [auto·moyenne sc=1.0] CAO (2A ECOMAP)
	"1100": "8.1 - CERAMIQUES ET VERRES",               // [auto·moyenne sc=1.0] CERAMIQUES ET VERRES (2A ECOMAP)
	"1065": "",                                         // [à vérifier sc=0.67] DIAGRAMME DE PHASES ET TRANSFORMATION (2A ECOMAP) | candidat: DIAGRAMME DE PHASES
	"978":  "8.4 - MATÉRIAUX ET RESSOURCES",            // [auto·moyenne sc=1.0] MATERIAUX ET RESSOURCES (2A ECOMAP)
	"1067": "8.2 - MATERIAUX POLYMÈRES",                // [auto·moyenne sc=1.0] MATERIAUX POLYMERES (2A ECOMAP)
	"1082": "8.3 - MÉCANIQUE DE LA RUPTURE",            // [auto·moyenne sc=1.0] MECANIQUE DE LA RUPTURE (2A ECOMAP)
	"1256": "8.1 - MÉTAUX ET ALLIAGES",                 // [auto·moyenne sc=1.0] METAUX ET ALLIAGES (2A ECOMAP)
	"960":  "MISSION",                                  // [auto·moyenne sc=1.0] MISSION R&D (2A ECOMAP)
	"1599": "",                                         // [à vérifier sc=0.55] PROJET ACV (2A ECOMAP) | candidat: 6.5.2 PROJ - PROJET
	"1255": "8.3 - RHÉOLOGIE",                          // [auto·moyenne sc=1.0] RHEOLOGIE (2A ECOMAP)
	"973":  "8.4 - SÉLECTION DES MATÉRIAUX",            // [auto·moyenne sc=1.0] SELECTION DES MATERIAUX (2A ECOMAP)
	"958":  "8.1-CMC-BAT SEMINAIRE R&D",                // [auto·moyenne sc=1.0] SEMINAIRE R&D (2A ECOMAP)
	"993":  "8.3 - TP CARACTÉRISATION ET MODÉLISATION", // [auto·moyenne sc=1.0] TP CARACTERISATION ET MODELISATION (2A ECOMAP)
	"1099": "8.1 - VERRES",                             // [auto·moyenne sc=1.0] VERRES (2A ECOMAP)

	// ┌─ 2A I2ER  (17/29 mappés) ─────────────────────────────────────────────────
	"2098": "",                                             // [événement] PRESENTATION OPTIONS DEPARTEMENT I2ER (2A I2ER)
	"2084": "",                                             // [à vérifier] RISQUE ET TENSION CLIMATIQUE (2A I2ER)
	"1888": "",                                             // [événement] VISITE DE SITE INDUSTRIELS (2A I2ER)
	"1030": "",                                             // [à vérifier] 8.0- BRIEFING (2A I2ER)
	"1012": "8.1-IEER-ECOSYSTEMES BIODIVERSITE",            // [auto·haute sc=1.23] 8.1- ECOSYSTEMES ET BIODIVERSITE (2A I2ER)
	"1013": "",                                             // [à vérifier sc=0.62] 8.1- ENJEUX ENERGETIQUES & SYSTEMES ELEC (2A I2ER) | candidat: 8.1.A. DL - SYSTÈMES EMBARQUÉS ET I.O.T.
	"1014": "8.1 - ETUDE D'IMPACT ET RISQUE SANITAIRE",     // [auto·moyenne sc=0.89] 8.1- ETUDE D'IMPACT & RISQUES SANITAIRES (2A I2ER)
	"1010": "",                                             // [à vérifier sc=0.71] 8.1- RISQUES INDUSTRIELS (2A I2ER) | candidat: S1/M6- ETUDE DE CAS RISQUES INDUSTRIELS ORAL
	"1011": "",                                             // [à vérifier sc=0.84] 8.1- RISQUES NATURELS (2A I2ER) | candidat: 8.1-CMC-BAT MATERIAUX NATURELS (PAILLE, PIERRE, TERRE, BETONS VEGETAUX)
	"1018": "8.2 - DISPERSION ATMOSPHERIQUE",               // [auto·haute sc=1.35] 8.2- DISPERSION ATMOSPHERIQUE (2A I2ER)
	"1017": "8.2 - DISPERSION DES POLLUANTS DANS LES SOLS", // [auto·haute sc=1.26] 8.2- DISPERSION DES POLLUANTS DANS LES S (2A I2ER)
	"1016": "8.2 - METEOROLOGIE",                           // [auto·haute sc=1.35] 8.2- METEOROLOGIE (2A I2ER)
	"1019": "8.2 - MODÉLISATION ATMOSPHÉRIQUE ARIA IMPACT", // [auto·haute sc=1.23] 8.2- MODELISATION - ARIA IMPACT (2A I2ER)
	"1015": "ISERM - 8.4.3 : REGLEMENTATION ICPE",          // [auto·moyenne sc=1.0] 8.2- REGLEMENTATION ICPE (2A I2ER)
	"1022": "8.3 - DISTILLATION",                           // [auto·haute sc=1.35] 8.3- DISTILLATION (2A I2ER)
	"1025": "",                                             // [à vérifier sc=0.45] 8.3- METHODES HAZID ET ENVID (2A I2ER) | candidat: 8.3 ELEMENTS FINIS 2
	"1023": "8.3 - REACTEURS CHIMIQUES",                    // [auto·haute sc=1.35] 8.3- REACTEURS CHIMIQUES (2A I2ER)
	"1021": "8.3 - TRANSFERT DE MATIERE",                   // [auto·haute sc=1.35] 8.3- TRANSFERT DE MATIERE (2A I2ER)
	"1887": "8.4 - PROJET OLEUM",                           // [auto·moyenne sc=1.03] 8.4 - PRESENT. PROJET OLEUM (2A I2ER)
	"1029": "",                                             // [à vérifier] 8.4- DEBAT PUBLIC (2A I2ER)
	"1626": "8.4 - PROJET OLEUM",                           // [auto·haute sc=1.35] 8.4- PROJET OLEUM (2A I2ER)
	"1032": "8.4 - PROJET OLEUM",                           // [auto·moyenne sc=0.88] 8.4- PROJET OLEUM ETUDE GLOBALE (2A I2ER)
	"1624": "",                                             // [événement] 8.4- PROJET OLEUM INTEGRATION PROC/TERR (2A I2ER)
	"1622": "8.4 - PROJET OLEUM",                           // [auto·moyenne sc=1.03] 8.4- PROJET OLEUM PROCEDES (2A I2ER)
	"1623": "8.4 - PROJET OLEUM",                           // [auto·moyenne sc=1.02] 8.4- PROJET OLEUM TERRITOIRES (2A I2ER)
	"1059": "",                                             // [à vérifier sc=0.8] 8.4- SIG (2A I2ER) | candidat: 8.2-IEER-SIG
	"1035": "",                                             // [à vérifier sc=0.71] 8.5- FORMATION SECURITE MISSION R&D (2A I2ER) | candidat: 8.5 - SOUTENANCE MISSION R&D
	"1033": "8.5 - MISSION R&D ECRIT",                      // [auto·haute sc=1.14] 8.5- MISSION R&D (2A I2ER)
	"1034": "SVA - 4 - SOUTENANCES MISSION 4",              // [auto·moyenne sc=1.0] 8.5- SOUTENANCES MISSION R&D (2A I2ER)

	// ┌─ 2A IGO+BE+BAT  (44/57 mappés) ───────────────────────────────────────────
	"2089": "",                                                                             // [à vérifier] ACCOMPAGNEMENT PROJET PROFESSIONNEL (2A IGO+BE+BAT)
	"1716": "FCD 8.3 - COMMUNICATION ÉCRITE",                                               // [auto·moyenne sc=1.0] COMMUNICATION ECRITE (2A IGO+BE+BAT)
	"1721": "DEVELOPPEMENT PERSONNEL",                                                      // [auto·moyenne sc=1.0] DPPA DEVELOPPEMENT PERSONNEL (2A IGO+BE+BAT)
	"1617": "9.3 IEE - ECONOMIE CIRCULAIRE",                                                // [auto·moyenne sc=1.0] DPPA ECONOMIE CIRCULAIRE (2A IGO+BE+BAT)
	"1731": "",                                                                             // [à vérifier sc=0.52] DPPA FRESQUE DU NUMERIQUE (2A IGO+BE+BAT) | candidat: PREUVE NUMERIQUE (7.2 ASSI)
	"1733": "",                                                                             // [à vérifier] DPPA INCLUSION (2A IGO+BE+BAT)
	"1959": "",                                                                             // [événement] ECOLE FERMEE CAR LE LENDEMAIN JOUR FERIE (2A IGO+BE+BAT)
	"2065": "",                                                                             // [à vérifier sc=0.46] FORMATION SANTE ET SECURITE AU TRAVAIL (2A IGO+BE+BAT) | candidat: 2EM : 5.1 : REGLEMENT HYGIENE SANTE SECURITÉ : F. DERRIEN
	"1563": "GEOLOGIE",                                                                     // [auto·moyenne sc=1.0] GEOLOGIE (2A IGO+BE+BAT)
	"1732": "",                                                                             // [à vérifier sc=0.5] GESTION DU TEMPS ORGANISATION PERSONELLE (2A IGO+BE+BAT) | candidat: GESTION DU TEMPS
	"2101": "",                                                                             // [à vérifier sc=0.71] LANGUES (2A IGO+BE+BAT) | candidat: TC-7.7 LANGUES - ANGLAIS -
	"1555": "",                                                                             // [à vérifier sc=0.85] LIANTS ET BETONS (2A IGO+BE+BAT) | candidat: 8.1 - LIANTS ET BETONS COURANTS
	"1679": "8.6-MKX-DIM-SECURITE INFORMATIQUE ET USAGES DES TIC",                          // [auto·moyenne sc=1.0] SECURITE INFORMATIQUE ET USAGES DES TIC (2A IGO+BE+BAT)
	"176":  "",                                                                             // [à vérifier sc=0.81] 7.1-STR BASES DE CONCEPT CALCULS STRUCTU (2A IGO+BE+BAT) | candidat: 7.1-CMC-STR BASES DE CONCEPTION ET DE CALCUL DE STRUCTURES
	"178":  "7.1-CMC-STR ELEMENTS FINIS",                                                   // [auto·haute sc=1.35] 7.1-STR ELEMENTS FINIS (2A IGO+BE+BAT)
	"175":  "7.1-CMC-STR LIANTS HYDRAULIQUES ET BETONS COURANTS",                           // [auto·haute sc=1.13] 7.1-STR LIANTS HYDR BETONS COURANTS (2A IGO+BE+BAT)
	"177":  "7.1-CMC-STR MECANIQUE DES STRUCTURES",                                         // [auto·haute sc=1.35] 7.1-STR MECANIQUE DES STRUCTURES (2A IGO+BE+BAT)
	"1544": "7.2 ENR CONCEPTION BIOCLIMATIQUE DES BATIMENTS",                               // [auto·haute sc=1.22] 7.2 ENR CONCEPTION BIOCLIMATIQUE DES BAT (2A IGO+BE+BAT)
	"180":  "7.2 ENR CONFORT ET AMBIANCE THERMIQUE",                                        // [auto·haute sc=1.35] 7.2 ENR CONFORT ET AMBIANCE THERMIQUE (2A IGO+BE+BAT)
	"181":  "7.2 ENR LES MATERIAUX DE L ISOLATION",                                         // [auto·haute sc=1.35] 7.2 ENR MATERIAUX DE L'ISOLATION (2A IGO+BE+BAT)
	"1309": "7.2 ENR TRANSFERT DE MASSE",                                                   // [auto·haute sc=1.35] 7.2 ENR TRANSFERT DE MASSE (2A IGO+BE+BAT)
	"182":  "7.3-CMC-BAT ACOUSTIQUE DU BATIMENT",                                           // [auto·haute sc=1.35] 7.3 BAT ACOUSTIQUE DU BATIMENT (2A IGO+BE+BAT)
	"185":  "7.3-CMC-BAT BOIS CONSTRUCTION",                                                // [auto·haute sc=1.35] 7.3 BAT BOIS CONSTRUCTION (2A IGO+BE+BAT)
	"186":  "7.3-CMC-BAT CALCUL DES STRUCTURES EN BOIS",                                    // [auto·haute sc=1.35] 7.3 BAT CALCUL DES STRUCTURES EN BOIS (2A IGO+BE+BAT)
	"183":  "7.3-CMC-BAT CONCEPTION DES BATIMENTS - 1",                                     // [auto·haute sc=1.35] 7.3 BAT CONCEPTION DES BATIMENTS 1 (2A IGO+BE+BAT)
	"188":  "7.4-CMC-DIM  DROIT SOCIAL ET SPECIFIQUE AU METIER (DROIT DE LA CONSTRUCTION)", // [auto·haute sc=1.08] 7.4 DIM DROIT SOCIAL ET SPE AU METIER (2A IGO+BE+BAT)
	"187":  "7.4-CMC-DIM GESTION DE PROJET - 3 ATELIER ELECTIF",                            // [auto·moyenne sc=0.97] 7.4 DIM GESTIO DE PROJ 3 ATELIER ELECTIF (2A IGO+BE+BAT)
	"226":  "8.1B - BASE DE CONCEPTION ET DE CALCULS DE STRUCTURES",                        // [auto·haute sc=1.24] 8.1 - BASE CONCEPTION CALCULS (2A IGO+BE+BAT)
	"365":  "8.1 - BASES DE PROJET DE CONSTRUCTION",                                        // [auto·haute sc=1.35] 8.1 - BASES DU PROJET DE CONSTRUCTION (2A IGO+BE+BAT)
	"1565": "8.1 - L’ENVELOPPE DU BÂTIMENT",                                                // [auto·haute sc=1.35] 8.1 - L'ENVELOPPE DU BATIMENT (2A IGO+BE+BAT)
	"193":  "8.1 STR CALCUL DES BATIMENTS EN BETON ARME",                                   // [auto·haute sc=1.23] 8.1 STR  CALCUL DES BAT EN BETON ARME (2A IGO+BE+BAT)
	"2025": "8.2 - CONFORT ET AMBIANCE THERMIQUE",                                          // [auto·haute sc=1.35] 8.2 - CONFORT ET AMBIANCE THERMIQUE (2A IGO+BE+BAT)
	"2029": "8.2C - NOTE FINALE  INTERACTIONS SOLS STRUCTURES",                             // [auto·haute sc=1.19] 8.2 - INTERACTIONS SOLS-STRUCTURES (2A IGO+BE+BAT)
	"1561": "8.2 - MECANIQUE DES SOLS",                                                     // [auto·haute sc=1.35] 8.2 - MECANIQUE DES SOLS (2A IGO+BE+BAT)
	"1554": "",                                                                             // [à vérifier sc=0.7] 8.2 - OPTIMISATION STRUCTU. ENVIRO. BAT (2A IGO+BE+BAT) | candidat: 8.2 - OPTIMISATION STRUCTURELLE ET ENVIRONNEMENTALE DES BATIMENTS
	"1567": "8.2 ENR REGLEMENTATION ENVIRONNEMENTALE",                                      // [auto·haute sc=1.35] 8.2 - REGLEMENTATION ENVIRONNEMENTALE (2A IGO+BE+BAT)
	"1562": "8.2 - THERMIQUE DU BATIMENT",                                                  // [auto·haute sc=1.35] 8.2 - THERMIQUE DU BATIMENT (2A IGO+BE+BAT)
	"196":  "8.2 ENR BATIMENT PASSIF",                                                      // [auto·haute sc=1.35] 8.2 ENR BATIMENT PASSIF (2A IGO+BE+BAT)
	"179":  "8.2 ENT ECLAIRAGE",                                                            // [auto·haute sc=1.35] 8.2 ENR ECLAIRAGE (2A IGO+BE+BAT)
	"197":  "8.2 ENR GENIE CLIMATIQUE",                                                     // [auto·haute sc=1.35] 8.2 ENR GENIE CLIMATIQUE (2A IGO+BE+BAT)
	"198":  "8.2 ENR SIMULATION THERMIQUE DYNAMIQUE",                                       // [auto·haute sc=1.35] 8.2 ENR SIMULATION THERMIQUE DYNAMIQUE (2A IGO+BE+BAT)
	"2032": "8.3 - CALCUL DES STRUCTURES EN METAL ET EN BOIS",                              // [auto·haute sc=1.06] 8.3 - CALCUL DES BATS EN METAL ET BOIS (2A IGO+BE+BAT)
	"772":  "8.3 - CALCULS DES BATIMENTS EN BETON ARME",                                    // [auto·haute sc=1.06] 8.3 - CALCULS STRUCT BETON ARME (2A IGO+BE+BAT)
	"2037": "8.3 - INTERACTIONS SOLS-STRUCTURES",                                           // [auto·moyenne sc=1.03] 8.3 - INTERACTIONS SOLS-STRUCTURE (2A IGO+BE+BAT)
	"201":  "8.3 BAT ANALYSE DU CYCLE DE VIE DU BATIMENT",                                  // [auto·haute sc=1.09] 8.3 BAT ANALYSE DU CYCLE DE VIE DU BATIM (2A IGO+BE+BAT)
	"200":  "8.3 BAT ECONOMIE DU DEVELOPPEMENT DURABLE",                                    // [auto·moyenne sc=1.03] 8.3 BAT ECONOMIE DU DEVELOPPEMENT DURABL (2A IGO+BE+BAT)
	"203":  "8.3 BAT INITIATION A LA RECHERCHE",                                            // [auto·haute sc=1.35] 8.3 BAT INITIATION A LA RECHERCHE (2A IGO+BE+BAT)
	"184":  "8.3 BAT LE BIM ET L INTEROPERABILITE",                                         // [auto·haute sc=1.35] 8.3 BAT LE BIM ET L'INTEROPERABILITE (2A IGO+BE+BAT)
	"2036": "8.4 - CALCUL DES STRUCTURES MÉTALLIQUES",                                      // [auto·moyenne sc=1.02] 8.4 - CALCUL DES STRUCTS METALLIQUES (2A IGO+BE+BAT)
	"2034": "",                                                                             // [à vérifier sc=0.75] 8.4 - CONCEPT EXECUTION DES BATS (2A IGO+BE+BAT) | candidat: 8.4 - CONCEPTION ET EXÉCUTION DES BÂTIMENTS
	"2035": "8.4 - OUVRAGES HYDRAULIQUES",                                                  // [auto·haute sc=1.35] 8.4 - OUVRAGES HYDRAULIQUES (2A IGO+BE+BAT)
	"773":  "8.4 - TERRASSEMENTS ET  ROUTES",                                               // [auto·haute sc=1.35] 8.4 - TERRASSEMENTS ET ROUTES (2A IGO+BE+BAT)
	"204":  "8.4 DIM MANAGEMENT ENTREPRISE ET EQUIPE",                                      // [auto·haute sc=1.35] 8.4 DIM MANAGEMENT ENTREPRISE ET EQUIPE (2A IGO+BE+BAT)
	"371":  "8.5 - MISSION R&D ECRIT",                                                      // [auto·haute sc=1.14] 8.5 - MISSION R & D (2A IGO+BE+BAT)
	"1652": "8.5 - PROJET BÂTIMENT",                                                        // [auto·haute sc=1.35] 8.5 - PROJET BATIMENT (2A IGO+BE+BAT)
	"1665": "",                                                                             // [à vérifier sc=0.7] 8.5 LING ANGLAIS OU AUTRES LANGUES VIVAN (2A IGO+BE+BAT) | candidat: 8.5. ANGLAIS OU AUTRE LANGUE VIVANTE
	"207":  "",                                                                             // [à vérifier] 8.6 DPPA (2A IGO+BE+BAT)

	// ┌─ 2A ISERM  (16/19 mappés) ────────────────────────────────────────────────
	"1889": "",                                                                 // [événement] RENCONTRE ENTREPRISES (2A ISERM)
	"922":  "8.1.1 HYDROGÉOLOGIE",                                              // [auto·haute sc=1.35] 8.1.1 HYDROGEOLOGIE (2A ISERM)
	"921":  "",                                                                 // [à vérifier sc=0.71] 8.1.2 GEOSTATISTIQUE (2A ISERM) | candidat: MAITRISE STATISTIQUE DES PROCEDES
	"1389": "8.1.3 MÉCANIQUE DES ROCHES",                                       // [auto·haute sc=1.35] 8.1.3 MECANIQUE DES ROCHES (2A ISERM)
	"923":  "8.2.1 : RESSOURCES MINÉRALES",                                     // [auto·haute sc=1.07] 8.2.1 ENJEUX DES RESSOURCES MINERALES (2A ISERM)
	"927":  "8.2.1 RESSOURCES MINÉRALES",                                       // [auto·moyenne sc=1.04] 8.2.2 RESSOURCES MINERALES (2A ISERM)
	"924":  "",                                                                 // [à vérifier sc=0.67] 8.2.3 MATERIAUX DE CONSTRUCTION (2A ISERM) | candidat: 8.2 MATÉRIAUX POLYMÈRES
	"926":  "8.3.1 MÉCANIQUE DES SOLS",                                         // [auto·haute sc=1.35] 8.3.1 MECANIQUE DES SOLS (2A ISERM)
	"928":  "8.3.2 TERRASSEMENT",                                               // [auto·haute sc=1.35] 8.3.2 TERRASSEMENT (2A ISERM)
	"929":  "8.3.3 ROUTE",                                                      // [auto·haute sc=1.35] 8.3.3 ROUTE (2A ISERM)
	"931":  "8.4.1 EXPLOITATION DES CARRIERES",                                 // [auto·haute sc=1.35] 8.4.1 EXPLOITATION DES CARRIERES (2A ISERM)
	"1585": "8.4.2 TRANSFORMATION NUMERIQUE",                                   // [auto·haute sc=1.35] 8.4.2 TRANSFORMATION NUMERIQUE (2A ISERM)
	"932":  "8.4.3 REGLEMENTATION ICPE",                                        // [auto·haute sc=1.35] 8.4.3 REGLEMENTATION ICPE (2A ISERM)
	"933":  "8.5.1 ABATTAGE",                                                   // [auto·haute sc=1.35] 8.5.1 ABATTAGE (2A ISERM)
	"934":  "8.5.2 TRANSPORT",                                                  // [auto·haute sc=1.35] 8.5.2 TRANSPORT (2A ISERM)
	"936":  "8.5.3 TRAITEMENT MECANIQUE",                                       // [auto·haute sc=1.35] 8.5.3 TRAITEMENT MECANIQUE (2A ISERM)
	"1390": "8.6.1 CORALIS",                                                    // [auto·haute sc=1.35] 8.6.1 CORALIS (2A ISERM)
	"1587": "8.6.3 LES OUTILS D'AIDE À LA DECISION",                            // [auto·haute sc=1.35] 8.6.3 LES OUTILS D'AIDE A LA DECISION (2A ISERM)
	"935":  "8.7 : PROJET RTCE (ROUTE, TERRASSEMENT, CARRIÈRE, ENVIRONNEMENT)", // [auto·moyenne sc=0.87] 8.7 PROJET RTCE (2A ISERM)

	// ┌─ 2A MKX  (31/42 mappés) ──────────────────────────────────────────────────
	"1893": "",                                                                           // [à vérifier] COURS CATIA (CAO SOLIDWORKS) (2A MKX)
	"2030": "",                                                                           // [événement] PRESENTATION INSTN (2A MKX)
	"2023": "",                                                                           // [événement] SOUTENANCES DE CONCEPTION DETAILLEE (2A MKX)
	"2022": "",                                                                           // [événement] SOUTENANCES DE CONCEPTION PRELIMINAIRE (2A MKX)
	"652":  "7.1-STM-MECANIQUE GENERALE 2 - SYSTEMES MULTICORPS (PARTIE 2)",              // [auto·moyenne sc=0.88] 7.1 - MECANIQUE GENERALE-2- SYS MULTICOR (2A MKX)
	"1556": "7.1-2M MÉTROLOGIE",                                                          // [auto·haute sc=1.17] 7.1 - METROLOGIE (2A MKX)
	"656":  "7.2-STM-AUTOMATIQUE (PARTIE 3)",                                             // [auto·haute sc=1.35] 7.2 - AUTOMATIQUE - 2 (2A MKX)
	"655":  "7.2-STM-CAPTEURS ET CHAINES DE MESURE",                                      // [auto·haute sc=1.35] 7.2 - CAPTEURS & CHAINES DE MESURE (2A MKX)
	"1334": "7.2-EAI MICRO CONTROLEURS",                                                  // [auto·haute sc=1.23] 7.2 - MICRO CONTROLEURS (2A MKX)
	"658":  "7.3-STM-DOMAINE ÉLECTIF",                                                    // [auto·haute sc=1.35] 7.3-A - DOMAINE ELECTIF (2A MKX)
	"1336": "",                                                                           // [à vérifier sc=0.62] 7.3-B - PERFORMAN INDUS: APPRO & ETU CAS (2A MKX) | candidat: 7.3.B-MKX-EAI-PERFORMANCE INDUSTRIELLE: APPROFONDISSEMENT ET ÉTUDE DE CAS
	"1335": "",                                                                           // [à vérifier] 7.3-B - S-I-ENTR (ERP) _G-C-LOGI (SCM) (2A MKX)
	"661":  "7.4-MKX-ISPI-INGENIERIE SYSTEME PROJET FIL ROUGE-IVTV",                      // [auto·haute sc=1.11] 7.4 - INGENIERIE SYSTEME :IVTV (2A MKX)
	"660":  "7.4-IS-PROCESSUS D'ÉVALUATION",                                              // [auto·haute sc=1.35] 7.4 - PROCESSUS D EVALUATION (2A MKX)
	"1951": "7.5-PROJ FIL ROUGE",                                                         // [auto·moyenne sc=0.86] 7.5 - P FIL-ROUGE - REVUE TECHNIQUE (2A MKX)
	"1338": "7.5-MKX-PROJ-PROJET FIL ROUGE",                                              // [auto·haute sc=1.35] 7.5 - PROJET FIL ROUGE (2A MKX)
	"663":  "7.6-DIM DROITS SOCIAL ET SPÉCIFIQUES AU MÉTIER ( PROPRIÉTÉS INDUSTRIELLES)", // [auto·moyenne sc=0.87] 7.6 - DROITS SOCIALS ET SPE AU METIER (2A MKX)
	"662":  "7.6-MKX-DIM-GESTION DE PROJET",                                              // [auto·haute sc=1.35] 7.6 - GESTION DE PROJET- 3 - (2A MKX)
	"664":  "7.7-MKX-ANG-ANGLAIS",                                                        // [auto·haute sc=1.35] 7.7 - ANGLAIS (2A MKX)
	"1671": "",                                                                           // [à vérifier sc=0.53] 7.8 - DPPA - FRESQUE DU NUMERIQUE (2A MKX) | candidat: 7.2 INFRES-ASSI PREUVE NUMÉRIQUE
	"1672": "",                                                                           // [à vérifier sc=0.47] 7.8 - DPPA - INCLUSION (2A MKX) | candidat: 7.8-MKX-DPPA-MISSION 3 -
	"1667": "",                                                                           // [à vérifier sc=0.54] 7.8 - DPPA -COMUNICATION ECRITE (2A MKX) | candidat: FCD 8.3 - COMMUNICATION ÉCRITE
	"1668": "7.8-DPPA-DEVELOPPEMENT PROFESSIONNEL ET PERSONNEL DE L'APPRENTI",            // [auto·haute sc=1.13] 7.8 - DPPA -DEVELOPPEMENT PERSONNEL (2A MKX)
	"666":  "8.1-STM-ÉLÉMENTS FINIS",                                                     // [auto·haute sc=1.35] 8.1 - ELEMENTS FINIS (2A MKX)
	"667":  "8.1-CMC-BAT MATERIAUX BOIS",                                                 // [auto·haute sc=1.16] 8.1 - MATERIAUX (2A MKX)
	"668":  "8.1-STM-TRANSFERTS THERMIQUES",                                              // [auto·haute sc=1.35] 8.1 - TRANSFERTS THERMIQUES (2A MKX)
	"2094": "8.2-MKX-EAI- AUTOMATIQUE - 3",                                               // [auto·haute sc=1.17] 8.2 - AUTOMATIQUE - 3 (2A MKX)
	"2093": "8.2-STM-ÉLECTRONIQUE DE PUISSANCE",                                          // [auto·haute sc=1.35] 8.2 - ELECTRONIQUE DE PUISSANCE (2A MKX)
	"670":  "8.2-STM-TRAITEMENT DU SIGNAL",                                               // [auto·haute sc=1.35] 8.2 - TRAITEMENT DU SIGNAL (2A MKX)
	"2095": "8.3-MKX-EAI-ROBOTIQUE INDUSTRIELLE - DEVELOPPEMENT",                         // [auto·haute sc=1.14] 8.3 - ROBOTIQUE INDUSTRIELLE (2A MKX)
	"673":  "8.3-MKX-EAI-SYSTEMES ET RESEAUX",                                            // [auto·haute sc=1.23] 8.3 - SYSTEMES EN RESEAUX (2A MKX)
	"2092": "8.4-MKX-ISPI-LEAN MANAGEMENT & OUTILS PERFORMANCE",                          // [auto·haute sc=1.06] 8.4- LEAN MANAGEMT ET OUTILS PERFORMANCE (2A MKX)
	"1292": "8.5-MKX-PROJ-INITIATION A LA RECHERCHE",                                     // [auto·haute sc=1.35] 8.5 - INITIATION A LA RECHERCHE (2A MKX)
	"677":  "8.5-MKX-PROJ-PROJET FIL ROUGE",                                              // [auto·haute sc=1.35] 8.5 - PROJET FIL ROUGE (2A MKX)
	"1952": "8.5-MKX-PROJ-PROJET FIL ROUGE",                                              // [auto·moyenne sc=0.96] 8.5 - PROJET FIL-ROUGE - REVUE TECHNIQUE (2A MKX)
	"2096": "8.6-MKX-DIM-MANAGEMENT ENTREPRISE ET EQUIPE",                                // [auto·haute sc=1.35] 8.6 - MANAGEMENT ENTREPRISE ET EQUIPE (2A MKX)
	"679":  "8.6-MKX-DIM-SECURITE INFORMATIQUE ET USAGES DES TIC",                        // [auto·haute sc=1.09] 8.6 - SECURITE INFORMAT ET USAGES TIC (2A MKX)
	"2097": "8.7-MKX-LING-ANGLAIS OU AUTRE LANGUE LANGUE VIVANTE",                        // [auto·haute sc=1.33] 8.7 - ANGLAIS OU AUTRE LANGUE VIVANTE (2A MKX)
	"1673": "",                                                                           // [à vérifier] 8.8 - DPPA - COMPETENCES INTERCULTURELLE (2A MKX)
	"1293": "ECONOMIE CIRCULAIRE",                                                        // [auto·moyenne sc=1.0] 8.8 - DPPA - ECONOMIE CIRCULAIRE (2A MKX)
	"1674": "",                                                                           // [à vérifier] 8.8 - DPPA - GESTION TPS ET ORGA PERSO (2A MKX)
	"2099": "8.8-MKX-DPPA-MISSION 4-",                                                    // [auto·haute sc=1.35] 8.8 - DPPA - MISSION 5 (2A MKX)

	// ┌─ 2A PRISM  (11/14 mappés) ────────────────────────────────────────────────
	"804":  "8.1.1 - PRINCIPE DE L INGENIERIE SYSTEME",   // [auto·haute sc=1.35] 8.1.1. PRINCIPE DE L'INGENIERIE SYSTEME (2A PRISM)
	"808":  "8.1.2. INGENIERIE DES EXIGENCES",            // [auto·haute sc=1.35] 8.1.2. INGENIERIE DES EXIGENCES (2A PRISM)
	"809":  "8.1.3. INGENIERIE DES ARCHITECTURES",        // [auto·haute sc=1.35] 8.1.3. INGENIERIE DES ARCHITECTURES (2A PRISM)
	"810":  "8.2.1 - SURETE DE FONCTIONNEMENT",           // [auto·haute sc=1.35] 8.2.1. SURETE DE FONCTIONNEMENT (2A PRISM)
	"811":  "8.2.2 - VERIFICATION, VALIDATION ET IVTV",   // [auto·haute sc=1.35] 8.2.2. VERIFICATION, VALIDATION ET IVTV (2A PRISM)
	"812":  "8.2.3 - EVALUATION DES SYSTEMES",            // [auto·haute sc=1.35] 8.2.3. EVALUATION DES SYSTEMES (2A PRISM)
	"815":  "8.4.1 - PROJET DE CAO",                      // [auto·moyenne sc=1.04] 8.3.1. PROJET DE CAO (2A PRISM)
	"816":  "8.4.2 - MODELISATION MULTI-DOMAINES",        // [auto·moyenne sc=1.04] 8.3.2. MODELISATION MULTI DOMAINES (2A PRISM)
	"814":  "",                                           // [à vérifier] 8.3.3 IOT (2A PRISM)
	"817":  "",                                           // [à vérifier sc=0.75] 8.3.4.. OUTILS INFORMAT. POUR ENTREPRISE (2A PRISM) | candidat: 8.3.4 OUTILS D'INFORMATION POUR L'ENTREPRISE
	"818":  "8.5.1 - ROBOTIQUE ET COBOTIQUE",             // [auto·moyenne sc=1.04] 8.4.1. ROBOTIQUE ET COBOTIQUE (2A PRISM)
	"819":  "8.4.2 AUTOMATIQUE : SYSTEMES NON LINEAIRES", // [auto·moyenne sc=0.88] 8.4.2. AUTOMATIQUE : SYST. NON LINEAIRES (2A PRISM)
	"1730": "8.4.3 CYBERSECURITE",                        // [auto·haute sc=1.35] 8.4.3 CYBERSECURITE (2A PRISM)
	"896":  "",                                           // [à vérifier sc=0.82] 8.6. MISSIONS R & D (2A PRISM) | candidat: MISSIONS M2

	// ┌─ 3A 2IA  (15/51 mappés) ──────────────────────────────────────────────────
	"1316": "",                                                                                                                   // [à vérifier] FORMATION SANITAIRE ET SURETE (3A 2IA)
	"2016": "",                                                                                                                   // [événement] FORUM DES DEPARTEMENTS (3A 2IA)
	"465":  "",                                                                                                                   // [événement] FORUM DES ENTREPRISES (3A 2IA)
	"2015": "",                                                                                                                   // [à vérifier] HACKATHON S10 (3A 2IA)
	"1327": "",                                                                                                                   // [à vérifier] LIBRE (3A 2IA)
	"1741": "",                                                                                                                   // [à vérifier sc=0.5] MECENAT ENTREPRISES (3A 2IA) | candidat: MODÉLISATION  D'ENTREPRISES
	"898":  "",                                                                                                                   // [événement] PRESENTATION ETUDES TECHNIQUES (3A 2IA)
	"1957": "",                                                                                                                   // [événement] RENCONTRE ECHANGES ELEVES (3A 2IA)
	"1875": "10.1 ISAD-DEEP APPRENTISSAGE PROFOND AVANCE/ADVANCED DEEP LEARNING",                                                 // [auto·moyenne sc=0.89] 10.1 APPRENTISSAGE PROFOND AVANCE (3A 2IA)
	"1899": "",                                                                                                                   // [à vérifier sc=0.73] 10.1 COMPORTEMENT ET INTERACTION (3A 2IA) | candidat: 10.1 - INTERACTION SOLS STRUCTURES EN RÉHABILITATION
	"2019": "",                                                                                                                   // [à vérifier sc=0.45] 10.1 TRAITEMENT D'IMAGES ET DE VIDEOS (3A 2IA) | candidat: 10.1 2IA IASD_IMG PROCESSUS VISUELS
	"509":  "",                                                                                                                   // [à vérifier sc=0.74] 10.1.1 KNOWLEDGE MANAGEMENT (3A 2IA) | candidat: 10.1.1 IAIL-IASD_CON GESTION DES CONNAISSANCES / KNOWLEDGE MANAGEMENT
	"1868": "",                                                                                                                   // [à vérifier sc=0.83] 10.1.1 PSYCHOLOGIE COGNITIVE (3A 2IA) | candidat: 10.1.1 COGNITIA PSYCHOLOGIE COGNITIVE
	"1869": " 10.1.2  COGNITIA INTERACTION HOMME - MACHINE",                                                                      // [auto·moyenne sc=0.97] 10.1.2 INTERACTION HOMME MACHINE (3A 2IA)
	"510":  "10.1.2 2IA IASD IL-IASD_CON MODELISATION DES CONNAISSANCES ET WEB SEMANTIQUE / KNOWLEDGE MODELING AND SEMANTIC WEB", // [auto·moyenne sc=0.89] 10.1.2 KNOWLEDGE MODELING AND SEMANTIC W (3A 2IA)
	"1871": "10.1.4 COGNITIA COLLABORATION HOMME MACHINE",                                                                        // [auto·moyenne sc=0.97] 10.1.4 COLLABORATION HOMME MACHINE (3A 2IA)
	"1876": "",                                                                                                                   // [à vérifier sc=0.85] 10.2 APPRENTISSAGE PAR RENFORCEMENT (3A 2IA) | candidat: 10.2  IASD-DEEP APPRENTISSAGE PAR RENFORCEMENT
	"2020": "",                                                                                                                   // [à vérifier sc=0.55] 10.2 INTERPRETATION D'IMAGE PAR IA (3A 2IA) | candidat: 10.2.3 COGNITIA CREATION ASSISTEE PAR L'IA
	"455":  "",                                                                                                                   // [à vérifier sc=0.81] 10.2.1 CLOUD COMPUTING (3A 2IA) | candidat: 10.2.1 IAIL CLOUD COMPUTING / CLOUD COMPUTING
	"1872": "",                                                                                                                   // [à vérifier sc=0.84] 10.2.1 DEVELOPPEMENT ECO ET SOCIO RESPON (3A 2IA) | candidat: 10.2.1 COGNITIA DEVELOPPEMENT ECO ET SOCIO-RESPONSABLE
	"1873": "",                                                                                                                   // [à vérifier sc=0.81] 10.2.2 DROITS DE LA DONNEE, DROIT LOGICI (3A 2IA) | candidat: 10.2.2 COGNITIA DROITS DE LA DONNEE, DROIT LOGICIEL, DROIT AUTEUR
	"515":  "10.2.2 IAIL URBANISATION DES SI/IS URBANISATION",                                                                    // [auto·haute sc=1.28] 10.2.2 IS URBANISATION (3A 2IA)
	"1874": "10.2.3 COGNITIA CREATION ASSISTEE PAR L'IA",                                                                         // [auto·moyenne sc=0.96] 10.2.3 CREATION ASSISTEE PAR L'IA (3A 2IA)
	"516":  "10.2.3 IAIL SECURITE DES SI/IS SECURITY",                                                                            // [auto·haute sc=1.13] 10.2.3 IS SECURITY (3A 2IA)
	"914":  "10.3 PROJET DE MISE EN APPLICATIONDE METHODES ET TECHNIQUES ACQUISES",                                               // [auto·moyenne sc=0.97] 10.3 ETUDES TECHNIQUES (3A 2IA)
	"862":  "",                                                                                                                   // [événement] 9.1 CONFERENCES (3A 2IA)
	"484":  "",                                                                                                                   // [à vérifier] 9.1.1 RGPD (3A 2IA)
	"485":  "",                                                                                                                   // [à vérifier] 9.1.2 NUMERIQUE RESPONSABLE (3A 2IA)
	"486":  "",                                                                                                                   // [à vérifier sc=0.64] 9.1.3 ECO-CONCEPTION D'UN SERVICE NUMERI (3A 2IA) | candidat: 9.1.3-CALCUL ET CONCEPTION DES STRUCTURES DE GÉNIE CIVIL EN BÉTON PRÉCONTRAINT
	"1511": "",                                                                                                                   // [à vérifier] 9.1.5 RGAA (3A 2IA)
	"1132": "9.2 APPRENTISSAGE AUTOMATIQUE AVANCE / ADVANCED MACHINE LEARNING",                                                   // [auto·haute sc=1.14] 9.2 APPRENTISSAGE AUTOMATIQUE AVANCE (3A 2IA)
	"1782": "9.3. IASD STATISTIQUES ET PROBABILITES AVANCEES / ADVANCED STATISTICS AND PROBABILITY",                              // [auto·moyenne sc=0.94] 9.3 ADVANCED STATISTICS AND PROBABILITY (3A 2IA)
	"1781": "",                                                                                                                   // [à vérifier sc=0.66] 9.3 STATISTIQUES ET PROBABILITES AVANCEE (3A 2IA) | candidat: 9.3. IASD STATISTIQUES ET PROBABILITES AVANCEES / ADVANCED STATISTICS AND PROBABILITY
	"498":  "",                                                                                                                   // [à vérifier] 9.3.1 ARCHITECTURES (3A 2IA)
	"1465": "",                                                                                                                   // [à vérifier sc=0.83] 9.3.2 SPECIFICATION FORMELLE EN ELECTRUM (3A 2IA) | candidat: 9.3.2 IAIL SPECIFICATION FORMELLE ET VERIFICATION EN ELECTRUM / ALLOY / FORMAL SPECIFICATION AND VERIFICATION IN ELECTRUM / ALLOY
	"1467": "",                                                                                                                   // [à vérifier sc=0.63] 9.3.2 SPECIFICATION FORMELLE ET VERIFICA (3A 2IA) | candidat: 9.3.2 IAIL SPECIFICATION FORMELLE ET VERIFICATION EN ELECTRUM / ALLOY / FORMAL SPECIFICATION AND VERIFICATION IN ELECTRUM / ALLOY
	"2013": "",                                                                                                                   // [à vérifier sc=0.49] 9.3.3 SPECIFICAT° & VERIFICAT° EN ALGEBR (3A 2IA) | candidat: 9.3.3 IAIL SPECIFICATION ET VERIFICATION EN ALGEBRES DES PROCESSUS
	"1783": "",                                                                                                                   // [à vérifier sc=0.73] 9.3.3 VALIDATION DES LOGICIELS / SOFTWAR (3A 2IA) | candidat: 9.3.3 IAIL VALIDATION DES LOGICIELS / SOFTWARE VALIDATION
	"490":  "",                                                                                                                   // [à vérifier sc=0.75] 9.4.1 HEURISTIC APPROACHES FOR COMBINATO (3A 2IA) | candidat: 9.4.1 IASD APPROCHES HEURISTIQUES POUR L'OPTIMISATION COMBINATOIRE / HEURISTIC APPROACHES FOR COMBINATORIAL OPTIMIZATION
	"529":  "9.4.1 IAIL MÉTA-MODÉLISATION ET TRANSFORMATION DES MODÈLES / META-MODELING AND MODEL TRANSFORMATION",                // [auto·moyenne sc=0.93] 9.4.1 META-MODELING AND MODEL TRANS (3A 2IA)
	"500":  "9.4.1 IAIL MÉTA-MODÉLISATION ET TRANSFORMATION DES MODÈLES / META-MODELING AND MODEL TRANSFORMATION",                // [auto·moyenne sc=0.94] 9.4.1 META-MODELING AND MODEL TRANSFORMA (3A 2IA)
	"491":  "9.4.2 IASD MATHEMATIQUES AVANCEES POUR L'APPRENTISSAGE AUTOMATIQUE / ADVANCED MATHEMATICS FOR MACHINE LEARNING",     // [auto·moyenne sc=0.91] 9.4.2 ADVANCED MATHEMATICS FOR MACHINE L (3A 2IA)
	"530":  "",                                                                                                                   // [à vérifier sc=0.47] 9.4.2 QUALITE LOGICIELLE (3A 2IA) | candidat: 9.4.2 IAIL QUALITÉS LOGICIELLES / SOFTWARE QUALITY
	"503":  "9.5.1 IAIL INTERNET DES OBJETS / INTERNET OF THINGS",                                                                // [auto·moyenne sc=0.93] 9.5.1 INTERNET OF THINGS (3A 2IA)
	"1409": "",                                                                                                                   // [à vérifier sc=0.79] 9.5.1 THEORIES DE L'INCERTAIN (3A 2IA) | candidat: 9.5.1 IASD THEORIES DE L'INCERTAIN / UNCERTAINLY THEORIES
	"1780": "",                                                                                                                   // [à vérifier sc=0.73] 9.5.2 ANALAYSE MULTICRITERE (3A 2IA) | candidat: 9.5.2 IASD ANALYSE MULTICRITERE / MULTIPLE CRITERIA DECISION ANALYSIS
	"1784": "",                                                                                                                   // [à vérifier sc=0.8] 9.5.2 DEVELOPPEMENT MOBILE (3A 2IA) | candidat: 9.5.2 IAIL DÉVELOPPEMENT MOBILE / MOBILE PROGRAMMING
	"493":  "",                                                                                                                   // [à vérifier sc=0.82] 9.5.2 MULTIPLE CRITERIA DECISION ANALYSI (3A 2IA) | candidat: 9.5.2 IASD ANALYSE MULTICRITERE / MULTIPLE CRITERIA DECISION ANALYSIS
	"495":  "",                                                                                                                   // [à vérifier sc=0.77] 9.6 APPRENTISSAGE PROFOND (3A 2IA) | candidat: 9.6. IASD APPRENTISSAGE PROFOND / DEEP LEARNING
	"1786": "",                                                                                                                   // [à vérifier sc=0.75] 9.6.1 CLIENT SERVEUR ET ARCH N-TIERS (3A 2IA) | candidat: 9.6.1 IAIL CLIENT-SERVEUR ET ARCHITECTURES N-TIERS / CLIENT-SERVER AND MULTITIER ARCHITECTURE
	"1785": "9.6.2 IAIL DÉVELOPPEMENT WEB AVANCE / ADVANCED WEB DEVELOPMENT",                                                     // [auto·moyenne sc=0.9] 9.6.2 DEVELOPPEMENT WEB AVANCE (3A 2IA)

	// ┌─ 3A BAT+BE  (35/44 mappés) ───────────────────────────────────────────────
	"1789": "",                                                                            // [à vérifier sc=0.52] COMMUNICATION INTERPERSONNELLE (3A BAT+BE) | candidat: COMMUNICATION
	"1464": "",                                                                            // [événement] CONFERENCE (3A BAT+BE)
	"1661": "",                                                                            // [à vérifier] DEV DES COMPERTENCES INTERCULTURELLES (3A BAT+BE)
	"1471": "9.1 STR DYNAMIQUE DES STRUCTURES",                                            // [auto·moyenne sc=1.0] DYNAMIQUE DES STRUCTURES (3A BAT+BE)
	"1788": "",                                                                            // [à vérifier sc=0.79] GESTION DU CHANGEMENT (3A BAT+BE) | candidat: 5.6-DIM-GESTION DE PROJET ET CONDUITE DU CHANGEMENT
	"1474": "",                                                                            // [à vérifier] PREPARATION 1ER CONTRAT DE TRAVAIL (3A BAT+BE)
	"1602": "",                                                                            // [à vérifier sc=0.69] 10.1A DIAGNOSTIC REPARATION BATS EN RENO (3A BAT+BE) | candidat: 10.1B - DIAGNOSTICS ET RÉPARATION DES BÂTIMENTS EN RÉNOVATION
	"1605": "",                                                                            // [à vérifier sc=0.8] 10.1A GEST.PATRIMOINE BATI ET REHAB (3A BAT+BE) | candidat: 10.1A- GESTION DU PATRIMOINE BATI ET REHABILITATION DE L'ENVELOPPE DU BATIMENT
	"2027": "10.2 - ETUDE TECHNIQUE « RÉHABILITATION DE BÂTIMENTS »",                      // [auto·haute sc=1.25] 10.2C - ETUDE TECHNIQUE REHABILITATION (3A BAT+BE)
	"1470": "9.1-CMC-STR BETON ARME - LE PROJET D EXECUTION",                              // [auto·haute sc=1.13] 9.1 BAT STR BETON ARME LE PROJET D EXEC (3A BAT+BE)
	"125":  "9.1-CMC-STR DYNAMIQUE DES STRUCTURES",                                        // [auto·haute sc=1.35] 9.1-BAT-STR DYNAMIQUE DES STRUCTURES (3A BAT+BE)
	"126":  "9.1-CMC-STR GENIE PARASISMIQUE",                                              // [auto·haute sc=1.35] 9.1-BAT-STR GENIE PARASISMIQUE (3A BAT+BE)
	"168":  "",                                                                            // [à vérifier sc=0.75] 9.1BE - TECHNIQUE DE CONSTRUCT DES BATS. (3A BAT+BE) | candidat: 9.1 - TECHNIQUE DE CONSTRUCTION DES BÂTIMENTS
	"1549": "9.2 ENR GENIE CLIMATIQUE ENERGIES RENOUVELABLES",                             // [auto·haute sc=1.09] 9.2 ENR GENIE CLIMATIQUE ENERGIES RENOUV (3A BAT+BE)
	"127":  "9.2-CMC-ENR ETUDES DES FLUIDES SOUS ENVIRONNEMENT BIM",                       // [auto·moyenne sc=0.86] 9.2-BAT-ENR ETU DES FLUIDES SS ENVI BIM (3A BAT+BE)
	"171":  "9.2 - ACOUSTIQUE DU BATIMENT",                                                // [auto·haute sc=1.35] 9.2BE - ACOUSTIQUE DU BATIMENT (3A BAT+BE)
	"1970": "9.2 - RESEAUX DIVERS",                                                        // [auto·haute sc=1.35] 9.2BE - RESEAUX DIVERS (3A BAT+BE)
	"1144": "9.2 B-TRANSFERTS DE MASSE",                                                   // [auto·haute sc=1.35] 9.2BE - TRANSFERTS DE MASSE (3A BAT+BE)
	"1550": "9.3 BAT CONCEPTION DES BATIMENTS 2",                                          // [auto·haute sc=1.35] 9.3 BAT CONCEPTION DES BATIMENTS - 2 (3A BAT+BE)
	"169":  "9.3 - CONCEPTION BIOCLIMATIQUE DES BÂTIMENTS",                                // [auto·haute sc=1.22] 9.3 BE- CONCEPTION BIOCLIMATIQUE DES BAT (3A BAT+BE)
	"130":  "9.3 BAT METHODES D EXECUTION ET ETUDES DE PRIX",                              // [auto·moyenne sc=0.87] 9.3-BATMETHODES D EXEC ET ETUDES DE PRIX (3A BAT+BE)
	"172":  "",                                                                            // [à vérifier sc=0.76] 9.3BE - SIMULATION THERMIQ DYNAMIQ (3A BAT+BE) | candidat: 9.3 - SIMULATION THERMIQUE DYNAMIQUE
	"166":  "9.3 - SYSTEMES ENERGETIQUES DURABLES",                                        // [auto·haute sc=1.35] 9.3BE - SYSTEMES ENERGETIQUES DURABLES (3A BAT+BE)
	"1124": "9.4A PR ENR ETUDE D UN BATIMENT",                                             // [auto·haute sc=1.35] 9.4 A BAT PR ENR ETUDE D'UN BATIMENT (3A BAT+BE)
	"1122": "9.4A PR ENR ETUDES DE PRIX EN CORPS D ETATS",                                 // [auto·haute sc=1.08] 9.4 A BAT-PR ENR ETUDES DE PRIX DE L'ENV (3A BAT+BE)
	"1123": "9.4A PR ENR GENIE ELECTRIQUE DES INSTALLATIONS",                              // [auto·moyenne sc=0.94] 9.4 A BAT-PR ENR GENIE ELECT DES INSTALL (3A BAT+BE)
	"134":  "9.4A PR ENR DIAGNOSTICS ENERGETIQUES DES BATIMENTS",                          // [auto·moyenne sc=1.01] 9.4 A-BAT-PR-ENR DIAGNOSTICS ENE DES BAT (3A BAT+BE)
	"132":  "9.4A PR ENR ECLAIRAGE",                                                       // [auto·haute sc=1.35] 9.4 A-BAT-PR-ENR ECLAIRAGE (3A BAT+BE)
	"133":  "9.4A PR ENR REGULATION DES INSTALLATIONS THERMIQUES",                         // [auto·moyenne sc=0.95] 9.4 A-BAT-PR-ENR REGUL INSTAL THERMIQUES (3A BAT+BE)
	"137":  "9.4B PR BOIS CALCUL DES CONSTRUCTIONS EN BOIS",                               // [auto·moyenne sc=0.86] 9.4 B-BAT-PR-BOIS CALCU DES CONS EN BOIS (3A BAT+BE)
	"138":  "9.4B PR BOIS CONCEPTION DES BATIMENTS EN BOIS",                               // [auto·moyenne sc=0.95] 9.4 B-BAT-PR-BOIS CONCEP DES BAT EN BOIS (3A BAT+BE)
	"139":  "9.4B PR BOIS CONCEPTION PARASISMIQUE DES BATIMENTS EN BOIS",                  // [auto·moyenne sc=1.02] 9.4 B-BAT-PR-BOIS CONCEP PARASISMIQUE DE (3A BAT+BE)
	"1126": "9.4B PR BOIS ETUDE D UN BATIMENT EN BOIS",                                    // [auto·haute sc=1.33] 9.4 B-BAT-PR-BOIS ETUDE D'UN BATIMENT EN (3A BAT+BE)
	"140":  "9.4B-CMC-PR BOIS METHODES ET MISE EN OEUVRE DES STUCTURES EN BOIS",           // [auto·haute sc=1.06] 9.4 B-BAT-PR-BOIS METHODES ET MISE EN OE (3A BAT+BE)
	"145":  "9.4C PR STR BATIMENTS A OSSATURE MIXTE ACIER BETON",                          // [auto·moyenne sc=1.04] 9.4 C-BAT-PR-STR BAT A OSSATURE MIXTE AC (3A BAT+BE)
	"142":  "9.4C PR STR BATIMENTS EN BETON ARME",                                         // [auto·haute sc=1.35] 9.4 C-BAT-PR-STR BATIMENTS EN BETON ARME (3A BAT+BE)
	"147":  "9.4C PR STR INGENIERIE DES STRUCTURES AU FEU",                                // [auto·moyenne sc=1.04] 9.4 C-BAT-PR-STR INGENIER DES STR AU FEU (3A BAT+BE)
	"146":  "9.4C PR STR INTERACTIONS SOL STRUCTURE",                                      // [auto·haute sc=1.14] 9.4 C-BAT-PR-STR INTERACTIONS SOL STRUCT (3A BAT+BE)
	"144":  "9.4C PR STR OUVRAGES EN CHARPENTE METALLIQUE",                                // [auto·haute sc=1.13] 9.4 C-BAT-PR-STR OUVRAGES CHARPENTE META (3A BAT+BE)
	"143":  "9.4C PR STR STRUCTURES EN BETON PRECONTRAINT",                                // [auto·moyenne sc=0.95] 9.4 C-BAT-PR-STR STRU EN BETON PRECONTRA (3A BAT+BE)
	"151":  "9.5-CMC-PR(A)  SPECIALISATION A : REHABILITATION ENERGETIQUE DU BATIMENT",    // [auto·haute sc=1.17] 9.5-BAT-PR A REHABILITATION ENERGETIQUE (3A BAT+BE)
	"152":  "9.5-PR (B) SPECIALISTION (B) : CONSTRUCTION EN BOIS",                         // [auto·haute sc=1.22] 9.5-BAT-PR B CONSTRUCTION EN BOIS (3A BAT+BE)
	"153":  "9.5-CMC-PR(C)  SPECIALISATION C : REHABILITATION STRUCTURELLE DES BATIMENTS", // [auto·haute sc=1.17] 9.5-BAT-PR C REHABILITATION STRUCTURELLE (3A BAT+BE)
	"149":  "9.7-MKX-DPPA- MISSION 5",                                                     // [auto·haute sc=1.35] 9.7 C-BAT-DPPA MISSION 5 (3A BAT+BE)

	// ┌─ 3A ECOMAP  (10/23 mappés) ───────────────────────────────────────────────
	"1853": "ACV",                                                        // [auto·moyenne sc=1.0] ACV (3A ECOMAP)
	"1253": "ECOMAP 10.2 ASSEMBLAGE DES MATÉRIAUX PAR COLLAGE",           // [auto·moyenne sc=0.91] ASSEMBLAGE DES MATERIAUX PAR COLLAGE (3A ECOMAP)
	"1331": "",                                                           // [à vérifier sc=0.54] BIOPLASTIQUES ET BIOCOMPOSITES (3A ECOMAP) | candidat: 9.1  BIOPLASTIQUES ET BIOCOMPOSITES
	"1148": "",                                                           // [à vérifier sc=0.53] CARACTERISATION MODELISATION MAT.COMPOSI (3A ECOMAP) | candidat: 9.3  TP CARACTÉRISATION ET MODÉLISATION DES MATÉRIAUX COMPOSITES
	"1517": "9.3  MODÉLISATION DU COMPORTEMENT MÉCANIQUE DES COMPOSITES", // [auto·moyenne sc=0.9] COMPORTEMENT MECANIQUE DES COMPOSITES (3A ECOMAP)
	"1135": "",                                                           // [à vérifier sc=0.7] COMPOSITES ET RENFORTS FIBREUX (3A ECOMAP) | candidat: COMPOSITES ET RENFORTS
	"1064": "10.1 LES ÉLASTOMÈRES DANS LE TRANSPORT",                     // [auto·moyenne sc=1.0] ELASTOMERES DANS LE TRANSPORT (3A ECOMAP)
	"1057": "",                                                           // [à vérifier sc=0.71] LES BIOPLASTIQUES (3A ECOMAP) | candidat: 10.1 LES BIOPLASTIQUES : UN CHALLENGE INDUSTRIEL
	"997":  "ECOMAP 10.1 LES MATÉRIAUX POUR L'ÉNERGIE",                   // [auto·moyenne sc=0.88] MATERIAUX POUR L'ENERGIE (3A ECOMAP)
	"1084": "10.1 LES MATÉRIAUX POUR LA SANTÉ ET LE SPORT",               // [auto·moyenne sc=1.0] MATERIAUX POUR LA SANTE ET LE SPORT (3A ECOMAP)
	"1136": "",                                                           // [à vérifier sc=0.53] MICRO ET NANOCOMPOSITES (3A ECOMAP) | candidat: 9.1  MICRO ET NANOCOMPOSITES
	"698":  "",                                                           // [à vérifier sc=0.7] MODELISAT° PROCEDES PLASTURGIQUES (3A ECOMAP) | candidat: M 9.2 PROCEDES PLASTURGIQUES
	"697":  "",                                                           // [à vérifier sc=0.52] MODELISAT°COMPT.MECANIQUE COMPOSITES (3A ECOMAP) | candidat: 9.3  MODÉLISATION DU COMPORTEMENT MÉCANIQUE DES COMPOSITES
	"694":  "POUDRES ET SUSPENSIONS",                                     // [auto·moyenne sc=1.0] POUDRES ET SUSPENSIONS (3A ECOMAP)
	"790":  "M 9.2  PROCÉDÉS METALLURGIQUES",                             // [auto·moyenne sc=1.0] PROCEDES METALLURGIQUES (3A ECOMAP)
	"559":  "IMC 9.2 PROCEDES PLASTURGIQUES ET COMPOSITES",               // [auto·moyenne sc=0.91] PROCEDES PLASTURGIQUES ET COMPOSITES (3A ECOMAP)
	"1348": "",                                                           // [à vérifier sc=0.51] PROJET ECOCONCEPTION (3A ECOMAP) | candidat: M8.5  ECOCONCEPTION
	"1883": "",                                                           // [à vérifier sc=0.79] PROJETS FIL ROUGE (3A ECOMAP) | candidat: 9.5-A-MKX-PROJ-QUALIFICATION OPERATIONNELLE DU PROJETS FIL ROUGE (IVTV)
	"974":  "",                                                           // [à vérifier sc=0.79] PROPRIETES ASPECT DES MATERIAUX (3A ECOMAP) | candidat: ECOMAP 10.2 PROPRIÉTÉS D'ASPECT DES MATÉRIAUX : CONTRÔLE ET CONCEPTION
	"1971": "",                                                           // [à vérifier sc=0.83] SIMULATION PROCEDE D'INJECTION (3A ECOMAP) | candidat: 9.2  TP FABRICATION ADDITIVE ET SIMULATION DU PROCÉDÉ D'INJECTION
	"1058": "ECOMAP 10.2 TRAITEMENT DE SURFACE DES MATÉRIAUX",            // [auto·moyenne sc=0.91] TRAITEMENT DE SURFACE DES MATERIAUX (3A ECOMAP)
	"693":  "",                                                           // [à vérifier sc=0.75] TRANSFERTS THERMIQUES ET REACTION AU FEU (3A ECOMAP) | candidat: 9.3  TRANSFERTS THERMIQUES ET RÉACTION AU FEU
	"1155": "",                                                           // [à vérifier sc=0.75] VIEILLISSEMENT & FIN DE VIE MATERIAUX (3A ECOMAP) | candidat: 9.3  VIEILLISSEMENT ET FIN DE VIE DES MATÉRIAUX

	// ┌─ 3A I2ER  (52/102 mappés) ─────────────────────────────────────────────────
	"1880": "",                                                                             // [événement] FORUM DEPARTEMENT (3A I2ER)
	"1629": "",                                                                             // [à vérifier sc=0.48] RISQUE ASSURANCIEL (3A I2ER) | candidat: 9.3 RISC - RISQUE MINIER
	"2063": "",                                                                             // [à vérifier sc=0.5] RISQUES TUNNEL (3A I2ER) | candidat: RISQUES ETHIQUES
	"1428": "",                                                                             // [événement] 10.1EE - CONFERENCE INTRO HYDROGENE (3A I2ER)
	"1070": "10.1 E - STOCKAGE ENERGIE",                                                    // [auto·moyenne sc=0.96] 10.1EE- ENERGIE HYDRAULIQUE ET STOCKAGE (3A I2ER)
	"1236": "",                                                                             // [à vérifier sc=0.45] 10.1EE- FLEXIBILITE DE CONSOMMATION (3A I2ER) | candidat: 10.1. DPPA M6 : BILAN DE FORMATION
	"1237": "",                                                                             // [à vérifier sc=0.51] 10.1EE- RESEAU ELECTRIQUE (3A I2ER) | candidat: RESEAU TELEPHONIQUE
	"1068": "10.1EE - RÉSEAUX INTELLIGENTS",                                                // [auto·haute sc=1.35] 10.1EE- RESEAUX INTELLIGENTS (3A I2ER)
	"1069": "10.1EE - STOCKAGE DE L’ÉNERGIE, BATTERIES",                                    // [auto·haute sc=1.35] 10.1EE- STOCKAGE DE L'ENERGIE, BATTERIES (3A I2ER)
	"1634": "",                                                                             // [à vérifier] 10.1RISK - SENSIBILISAT. RISQ. HYDROGENE (3A I2ER)
	"611":  "10.1RISC - ASSURANCE",                                                         // [auto·haute sc=1.35] 10.1RISK- ASSURANCE (3A I2ER)
	"614":  "10.1RISK - ORGANISATION DES SECOURS",                                          // [auto·haute sc=1.35] 10.1RISK- ORGANISATION DES SECOURS (3A I2ER)
	"1040": "10.1 RISK - PLAN DE CONTINUITE D ACTIVITE",                                    // [auto·haute sc=1.35] 10.1RISK- PLAN DE CONTINUITE D'ACTIVITE (3A I2ER)
	"1037": "",                                                                             // [à vérifier sc=0.53] 10.1RISK- PREVENTION DES INONDATIONS (3A I2ER) | candidat: INONDATIONS
	"1038": "",                                                                             // [à vérifier sc=0.74] 10.1RISK- RESILIENCE DES TERRITOIRES (3A I2ER) | candidat: 10.1 RISC - RÉSILIENCE ORGANISATIONNELLE ET FACTEURS HUMAINS - ECRIT
	"612":  "",                                                                             // [à vérifier sc=0.62] 10.1RISK- RETOUR D'EXPERIENCE AZF (3A I2ER) | candidat: INGENIERIE DU RETOUR D'EXPERIENCE
	"1757": "",                                                                             // [à vérifier] 10.1RISK-IMPACT CHANG. GLOBL FONCT INDUS (3A I2ER)
	"1072": "",                                                                             // [à vérifier sc=0.49] 10.2EE- INTEGR PROC/OPTIMISAT ENERGETIQ (3A I2ER) | candidat: 10.2EE - OPTIMISATION ÉNERGÉTIQUE
	"1042": "COMMUNICATION DE CRISE",                                                       // [auto·moyenne sc=1.0] 10.2RISK- COMMUNICATION DE CRISE (3A I2ER)
	"1044": "10.2 RISK - GÉOMATIQUE ET GESTION DE CRISE",                                   // [auto·haute sc=1.35] 10.2RISK- GEOMATIQUE ET GESTION DE CRISE (3A I2ER)
	"1108": "10.2 RISK - GÉOMATIQUE ET GESTION DE CRISE",                                   // [auto·haute sc=1.19] 10.2RISK- GESTION DE CRISE (3A I2ER)
	"1041": "10.2 RISC - LES OUTILS DE GESTION DE CRISE ET LA SCÉNARISATION DES EXERCICES", // [auto·haute sc=1.15] 10.2RISK- LES OUTILS DE GESTION DE CRISE (3A I2ER)
	"1043": "",                                                                             // [à vérifier] 10.2RISK- OPENSTREETMAP (3A I2ER)
	"1045": "10.3RISK - PROJET GESTION DE L URGENCE ET GESTION DE CRISE",                   // [auto·moyenne sc=1.02] 10.2RISK- PROJET GESTION URGENCE & CRISE (3A I2ER)
	"615":  "",                                                                             // [à vérifier] 10.2RISK- VISOV (3A I2ER)
	"2049": "",                                                                             // [à vérifier] 10.3EE - BIOAEROSOL (3A I2ER)
	"1427": "",                                                                             // [à vérifier sc=0.46] 10.3EE - CONF QUALITE DE L'AIR INTERIEUR (3A I2ER) | candidat: 10.3 IEE - ACTIONS : TRAITER OU AGIR À LA SOURCE
	"1074": "10.3 IEE - ACTIONS : TRAITER OU AGIR À LA SOURCE",                             // [auto·haute sc=1.25] 10.3EE- ACTIONS : TRAITER OU AGIR A LA S (3A I2ER)
	"1073": "10.3 IEE - ANALYSE DES POLLUANTS ATMOSPHÉRIQUES",                              // [auto·haute sc=1.35] 10.3EE- ANALYSE POLLUANTS ATMOSPHERIQUES (3A I2ER)
	"1049": "",                                                                             // [à vérifier sc=0.83] 10.3RISK- CYBER SECURITE (3A I2ER) | candidat: 10.3 RISK - INGÉNIERIE DE LA SÉCURITÉ
	"1048": "10.3 RISK - FACTEURS HUMAINS ET ORGANISATIONNELS",                             // [auto·moyenne sc=1.01] 10.3RISK- FACTEURS HUMAINS ET ORGANISATI (3A I2ER)
	"1047": "10.3 RISK - INGÉNIERIE DE LA SÉCURITÉ",                                        // [auto·haute sc=1.35] 10.3RISK- INGENIERIE DE LA SECURITE (3A I2ER)
	"1075": "10.4EE - PROJET « ENERGIE & ENVIRONNEMENT »",                                  // [auto·haute sc=1.35] 10.4EE- PROJET ENERGIE & ENVIRONNEMENT (3A I2ER)
	"1826": "",                                                                             // [événement] 9.0MSSIE - ACCUEIL (3A I2ER)
	"1977": "",                                                                             // [à vérifier] 9.0MSSIE - EXERCICE NIOVELIUS (3A I2ER)
	"1976": "",                                                                             // [à vérifier] 9.0MSSIE - FONDAMENTAUX SCIENTIFIQUES (3A I2ER)
	"1825": "",                                                                             // [à vérifier] 9.0MSSIE - GEOCACHING (3A I2ER)
	"1975": "",                                                                             // [à vérifier] 9.0MSSIE - IA (3A I2ER)
	"702":  "",                                                                             // [à vérifier] 9.0MSSIE- DEMARCHE GLOBALE GESTION RISQU (3A I2ER)
	"701":  "",                                                                             // [à vérifier sc=0.72] 9.0MSSIE-DISPERSION ATMOSPHERIQUE (3A I2ER) | candidat: DISPERSION ATMOSPHERIQUE
	"1833": "",                                                                             // [à vérifier] 9.0MSSIE-EXCEL EN ENTREPRISE (3A I2ER)
	"1832": "",                                                                             // [à vérifier] 9.0MSSIE-GEOMATIQUE AVEC QGIS (3A I2ER)
	"1830": "",                                                                             // [à vérifier] 9.0MSSIE-INTRODUCTION A LAUDIT QSE (3A I2ER)
	"1828": "",                                                                             // [à vérifier sc=0.52] 9.0MSSIE-METHODOLOGIE RECHERCHE DOC (3A I2ER) | candidat: MSSIE 0 - MÉTHODOLOGIE DE LA RECHERCHE DOCUMENTAIRE
	"1831": "",                                                                             // [à vérifier sc=0.72] 9.0MSSIE-POLLUTION AQUATIQUE (3A I2ER) | candidat: POLLUTION AQUATIQUE
	"1829": "",                                                                             // [à vérifier] 9.0MSSIE-PREPARER CANDIDATURE SI (3A I2ER)
	"1827": "",                                                                             // [à vérifier] 9.0MSSIE-PREPARER THESE PRO. EN SI (3A I2ER)
	"1835": "",                                                                             // [à vérifier sc=0.53] 9.0MSSIE-REALISATION DUN BILAN CARBONE (3A I2ER) | candidat: BILAN CARBONE
	"1834": "",                                                                             // [à vérifier sc=0.49] 9.0MSSIE-REX ACCIDENTS INDUSTRIELS (3A I2ER) | candidat: MSSIE 0 - RETOURS D’EXPÉRIENCE ACCIDENTS INDUSTRIELS
	"1701": "",                                                                             // [événement] 9.1EE - CONFERENCE INTRO (3A I2ER)
	"561":  "9.1EE - GESTION ENVIRONNEMENTALE DE L'EAU",                                    // [auto·haute sc=1.35] 9.1EE- GESTION ENVIRONNEMENTALE DE L'EAU (3A I2ER)
	"562":  "9.1 IEE - GESTION ENVIRONNEMENTALE DE LA RESSOURCE EN EAU",                    // [auto·moyenne sc=0.86] 9.1EE- GESTION INTEGR. RESSOURCES EN EAU (3A I2ER)
	"563":  "9.1 IEE - RESEAUX ASSAINISSEMENT",                                             // [auto·haute sc=1.35] 9.1EE- RESEAUX D'ASSAINISSEMENT (3A I2ER)
	"560":  "9.1 IEE - SURVEILLANCE ENVIRONNEMENTALE",                                      // [auto·haute sc=1.35] 9.1EE- SURVEILLANCE ENVIRONNEMENTALE (3A I2ER)
	"1534": "9.1 RISK - IMMERSION DANS UN SILMULATEUR DE CRISE",                            // [auto·moyenne sc=0.98] 9.1RISK- IMMERSION SIMULATEUR CRISE (3A I2ER)
	"585":  "9.1 RISK - INDUSTRIE GAZIERE",                                                 // [auto·haute sc=1.35] 9.1RISK- INDUSTRIE GAZIERE (3A I2ER)
	"586":  "9.1 RISC - INDUSTRIE NUCLEAIRE",                                               // [auto·haute sc=1.35] 9.1RISK- INDUSTRIE NUCLEAIRE (3A I2ER)
	"584":  "9.1 - INDUSTRIE PETROCHIMIQUE",                                                // [auto·haute sc=1.35] 9.1RISK- INDUSTRIE PETROCHIMIQUE (3A I2ER)
	"564":  "9.2 IEE - SOLS POLLUES : RISQUES ET ENJEUX",                                   // [auto·haute sc=1.17] 9.2EE- SITES-SOLS POLLUES RISQUES ENJEUX (3A I2ER)
	"591":  "9.2 RISK - BLEVE",                                                             // [auto·haute sc=1.35] 9.2RISK- BLEVE (3A I2ER)
	"593":  "BOILOVER",                                                                     // [auto·moyenne sc=1.0] 9.2RISK- BOILOVER (3A I2ER)
	"589":  "9.2 - INCENDIE/DEBIT BRECHE ET EVAPORATION",                                   // [auto·haute sc=1.24] 9.2RISK- DEBIT A LA BRECHE/EVAPORATION (3A I2ER)
	"594":  "9.2 RISK - ELECTROSTATIQUE",                                                   // [auto·haute sc=1.35] 9.2RISK- ELECTROSTATIQUE (3A I2ER)
	"596":  "9.2 RISK - EMBALLEMENT REACTIONNEL",                                           // [auto·haute sc=1.35] 9.2RISK- EMBALLEMENT REACTIONNEL (3A I2ER)
	"590":  "9.2 RISK - EXPLOSION DE GAZ",                                                  // [auto·haute sc=1.35] 9.2RISK- EXPLOSION DE GAZ (3A I2ER)
	"595":  "9.2 RISK - EXPLOSION DE POUSSIERES",                                           // [auto·haute sc=1.35] 9.2RISK- EXPLOSION DE POUSSIERES (3A I2ER)
	"592":  "9.2RISK - INCENDIE",                                                           // [auto·haute sc=1.35] 9.2RISK- INCENDIE (3A I2ER)
	"2005": "",                                                                             // [à vérifier sc=0.79] 9.2RISK- OUTIL DE MODELISATION (3A I2ER) | candidat: 9.2 - RMCE / OUTIL D'INFORMATION
	"597":  "",                                                                             // [à vérifier sc=0.62] 9.2RISK- PHAST (3A I2ER) | candidat: MODÉLISATION PHÉNOMÈNES ACCIDENT. PHAST
	"566":  "9.3 IEE - ECOLOGIE INDUSTRIELLE ET TERRITORIALE",                              // [auto·moyenne sc=1.01] 9.3EE- ECOLOGIE INDUS. TERRITORIALE (3A I2ER)
	"567":  "",                                                                             // [à vérifier sc=0.81] 9.3EE- PROJET EIT (3A I2ER) | candidat: 9.3EE - INTRODUCTION EIT
	"604":  "",                                                                             // [à vérifier sc=0.54] 9.3RISK- EBOULEMENT ROCHEUX (3A I2ER) | candidat: EBOULEMENTS ROCHEUX
	"603":  "9.3 RISK - FONCTIONNEMENT DES HYDROSYSTEMES",                                  // [auto·moyenne sc=0.9] 9.3RISK- FONCTIONNEMENT DES HYDROSYSTEME (3A I2ER)
	"599":  "9.3 RISK - INCENDIES DE FORETS",                                               // [auto·haute sc=1.35] 9.3RISK- INCENDIES DE FORETS (3A I2ER)
	"602":  "",                                                                             // [à vérifier sc=0.54] 9.3RISK- METEOROLOGIE POUR L'INONDATION (3A I2ER) | candidat: METEOROLOGIE
	"606":  "9.3 RISC - RISQUE MINIER",                                                     // [auto·haute sc=1.35] 9.3RISK- RISQUE MINIER (3A I2ER)
	"600":  "9.3 RISC - SECHERESSE",                                                        // [auto·haute sc=1.35] 9.3RISK- SECHERESSE (3A I2ER)
	"1703": "",                                                                             // [événement] 9.4EE - COMPOSTAGE (3A I2ER)
	"1704": "",                                                                             // [à vérifier sc=0.7] 9.4EE - DECHETS ORGANIQUES METHANISATION (3A I2ER) | candidat: 9.4EE - PANORAMA DES DÉCHETS ET RÉGLEMENTATION
	"570":  "9.4 IEE - COGENERATION RESEAU DE CHALEUR",                                     // [auto·moyenne sc=0.88] 9.4EE- COGENERATION-RESEAU FLUID. ENERG. (3A I2ER)
	"568":  "9.4EE - PANORAMA DES DÉCHETS ET RÉGLEMENTATION",                               // [auto·haute sc=1.35] 9.4EE- PANORAMA DECHETS, REGLEMENTATION (3A I2ER)
	"609":  "9.4 RISK - METHODE D'ANALYSE DE RISQUE",                                       // [auto·moyenne sc=0.95] 9.4RISK- ANALYSE QUANTITATIVE DES RISQUE (3A I2ER)
	"617":  "",                                                                             // [à vérifier sc=0.69] 9.4RISK- BARRIERE MAITRISE DES RISQUES (3A I2ER) | candidat: 9.4 RISK - METHODE D'ANALYSE DES RISQUES
	"607":  "9.4 RISK - METHODE D'ANALYSE DES RISQUES",                                     // [auto·haute sc=1.35] 9.4RISK- METHODE D'ANALYSE DES RISQUES (3A I2ER)
	"1051": "REGLEMENTATION ATEX",                                                          // [auto·moyenne sc=1.0] 9.4RISK- REGLEMENTATION ATEX (3A I2ER)
	"608":  "",                                                                             // [à vérifier] 9.4RISK- SIL/ HAZOP (3A I2ER)
	"610":  "9.4 RISK - SURETE DE FONCTIONNEMENT",                                          // [auto·haute sc=1.35] 9.4RISK- SURETE DE FONCTIONNEMENT (3A I2ER)
	"1050": "",                                                                             // [à vérifier sc=0.72] 9.4RISK- TRANSPORT DE MATIERE DANGEREUS (3A I2ER) | candidat: 9.4 RISC - ATEX ET TRANSPORT DE MATIÈRES
	"572":  "9.5 IEE - PROJET TRAITEMENT DES EAUX ",                                        // [auto·haute sc=1.35] 9.5EE- PROJET TRAITEMENT DES EAUX (3A I2ER)
	"630":  "",                                                                             // [à vérifier sc=0.6] 9.5RISK-SIMULATION DE CRISE CIT'IN CRISE (3A I2ER) | candidat: 9.5 RISK - INTRODUCTION A LA GESTION DE CRISE
	"578":  "9.6 IEE - PHOTOVOLTAIQUE/BIOENERGIE",                                          // [auto·haute sc=1.11] 9.6EE- BIOENERGIE (3A I2ER)
	"1181": "9.6 IEE - ENERGIE NUCLEAIRE",                                                  // [auto·haute sc=1.12] 9.6EE- ENERGIE (3A I2ER)
	"573":  "9.6 EE - ENERGIE SOLAIRE ET EOLIENNE",                                         // [auto·haute sc=1.21] 9.6EE- ENERGIE EOLIENNE (3A I2ER)
	"575":  "",                                                                             // [à vérifier sc=0.82] 9.6EE- ENERGIE HYDROELECTRICITE (3A I2ER) | candidat: 9.6 IEE - ENERGIE HYDRAULIQUE
	"579":  "9.6 IEE - ENERGIE NUCLEAIRE",                                                  // [auto·haute sc=1.35] 9.6EE- ENERGIE NUCLEAIRE (3A I2ER)
	"623":  "",                                                                             // [à vérifier sc=0.84] 9.6EE- ENERGIE PHOTOVOLTAIQUE (3A I2ER) | candidat: 9.6 EE - ENERGIE HYRAULIQUE
	"576":  "",                                                                             // [à vérifier sc=0.48] 9.6EE- ENERGIES MARINES (3A I2ER) | candidat: 9.6 IEE - ENERGIE NUCLEAIRE
	"618":  "9.6 - ETUDE DE CAS",                                                           // [auto·haute sc=1.35] 9.6RISK A- ETUDE DE CAS (3A I2ER)
	"616":  "ETUDE DE DANGER",                                                              // [auto·moyenne sc=1.0] 9.6RISK A- ETUDE DE DANGER (3A I2ER)
	"621":  "9.6 RISK - ETUDE DE CAS RISQUES NATURELS",                                     // [auto·moyenne sc=0.86] 9.6RISK B- ETUDE DE CAS RISQUE INONDAT. (3A I2ER)
	"619":  "",                                                                             // [à vérifier sc=0.73] 9.6RISK B- HYDRAULIQ. DIMENSIONN. BASSIN (3A I2ER) | candidat: 9.6B RISK - HYDRAULIQUE ET DIMENSIONNEMENT DE BASSIN
	"620":  "",                                                                             // [à vérifier sc=0.46] 9.6RISK B- PREVISION DES CRUES (3A I2ER) | candidat: 9.6-DIM-GESTION DE PROJET (SIMULTRAIN)

	// ┌─ 3A IGO  (17/18 mappés) ──────────────────────────────────────────────────
	"1611": "10.1A - CALCULS DÉTAILLÉS ET MÉTHODES D’EXÉCUTION DES OUVRAGES PORTUAIRES", // [auto·moyenne sc=0.99] 10.1A CALCULS DETAILLES METHODES D'EXE (3A IGO)
	"1607": "10.1A - CONCEPTION DES OUVRAGES MARITIMES",                                 // [auto·haute sc=1.35] 10.1A CONCEPTION  DES OUVRAGES MARITIMES (3A IGO)
	"1608": "10.2 - ETUDE TECHNIQUE PONT",                                               // [auto·moyenne sc=0.99] 10.2A ETUDE TECHNIQUE MARITIME (3A IGO)
	"1477": "",                                                                          // [à vérifier sc=0.71] 9.1 STRUCTURES EN BOIS POUR LE GC (3A IGO) | candidat: 9.1 - STRUCTURES EN BOIS POUR LE GENIE CIVIL
	"263":  "9.1 A-STRUCTURES DE GC EN BETON ARME",                                      // [auto·haute sc=1.09] 9.1 STRUCTURES GC EN BETON ARME (3A IGO)
	"265":  "9.1 - STRUCTURES DE GC EN BETON PRECONTRAINT",                              // [auto·haute sc=1.1] 9.1 STRUCTURES GC EN BETON PRECONTRAINT (3A IGO)
	"173":  "9.7 DYNAMIQUE DES STRUCTURES",                                              // [auto·moyenne sc=1.04] 9.2 DYNAMIQUE DES STRUCTURES (3A IGO)
	"266":  "9.2 - ETUDE DES BÂTIMENTS EN PLASTICITÉ",                                   // [auto·haute sc=1.22] 9.2 ETUDE DES BATIMENTS EN PLASTICITE (3A IGO)
	"267":  "9.2 - GENIE PARASISMIQUE",                                                  // [auto·moyenne sc=0.88] 9.2 GENIE PARASISMIQUE (3A IGO)
	"269":  "9.3 B - BETON PRECONTRAINT HYPERSTATIQUE",                                  // [auto·moyenne sc=1.02] 9.3 BETON PRECONTRAINT HYPERSTATIQUE (3A IGO)
	"270":  "9.3 - CONCEPTION DES PONTS",                                                // [auto·moyenne sc=0.88] 9.3 CONCEPTION DES PONTS (3A IGO)
	"268":  "9.3 - INTERACTIONS SOL-STRUCTURE",                                          // [auto·moyenne sc=1.02] 9.3 INTERACTIONS SOL-STRUCTURE (3A IGO)
	"275":  "9.4 - ETUDES DE MÉTHODES ET PRÉPARATION DES CHANTIERS",                     // [auto·moyenne sc=0.88] 9.4 - ETUDES METHOD  PREPA CHANTIERS (3A IGO)
	"276":  "9.4 - GENIE CIVIL URBAIN",                                                  // [auto·moyenne sc=1.02] 9.4 GENIE CIVIL URBAIN (3A IGO)
	"1676": "9.4 - LE PROJET D'EXECUTION DES GRANDS OUVRAGES",                           // [auto·haute sc=1.1] 9.4 LE PROJET D'EXECUTION GRANDS OUVRAGE (3A IGO)
	"274":  "9.5 - ETUDE DE PRIX",                                                       // [auto·haute sc=1.11] 9.5  ETUDE DE PRIX (3A IGO)
	"273":  "9.5 - AUSCULTATION, MAINTENANCE ET REPARATION DES OUVRAGES",                // [auto·moyenne sc=0.97] 9.5 AUSCULTATION, MAINTENANCE REPARATION (3A IGO)
	"272":  "9.5 - DURABILITÉ, PATHOLOGIES ET DIAGNOSTICS DES OUVRAGES EN BÉTON",        // [auto·moyenne sc=0.94] 9.5 DURABILITE, PATHOLOGIES, DIAGNOSTICS (3A IGO)

	// ┌─ 3A ISERM  (9/24 mappés) ────────────────────────────────────────────────
	"1973": "",                                            // [à vérifier] INTRODUCTION AU PROJET MINES (3A ISERM)
	"778":  "",                                            // [à vérifier] PERFECTIONNEMENT (3A ISERM)
	"1890": "",                                            // [événement] RENCONTRE ENTREPRISE (3A ISERM)
	"945":  "",                                            // [à vérifier sc=0.46] 10.1 ECONOMIE MINIERE (3A ISERM) | candidat: ISERM : 10.3P : ECONOMIE MINIERE
	"947":  "10.1 - IC / TECHNIQUE DE CONSTRUCTION",       // [auto·haute sc=1.06] 10.1 ETUDE TECHNIQUE (3A ISERM)
	"1317": "",                                            // [à vérifier] 9.1 EXPLORATION (3A ISERM)
	"232":  "",                                            // [à vérifier sc=0.84] 9.1 GEOLOGIE STRUCTURALE (3A ISERM) | candidat: 9.1 - RMCE / GEOLOGIE STRUCTURALE
	"237":  "",                                            // [à vérifier sc=0.53] 9.1 PROCESSUS EXTRACTIF (3A ISERM) | candidat: ISERM - 9.2.1 : LE PROCESSUS EXTRACTIF
	"238":  "",                                            // [à vérifier sc=0.67] 9.2 EXPLOITATION A CIEL OUVERT (3A ISERM) | candidat: ISERM - 9.2.2 : EXPLOITATION A CIEL OUVERT
	"239":  "",                                            // [à vérifier sc=0.54] 9.2 EXPLOITATION SOUTERRAINE (3A ISERM) | candidat: ISERM - 9.2.3 : EXPLOITATION SOUTERRAINE
	"234":  "",                                            // [à vérifier sc=0.57] 9.2 PHASAGE ET PLANIFICATION (3A ISERM) | candidat: PLANIFICATION
	"243":  "ISERM 9.3.1P - ABATTAGE À L'EXPLOSIF",        // [auto·moyenne sc=0.88] 9.3P ABATTAGE EXPLOSIF (3A ISERM)
	"244":  "9.4 - TRANSPORT ET CHARGEMENT",               // [auto·moyenne sc=0.94] 9.3P CHARGEMENT ET TRANSPORT (3A ISERM)
	"245":  "ISERM - 8.5.3 : TRAITEMENT MECANIQUE",        // [auto·moyenne sc=1.0] 9.3P TRAITEMENT MECANIQUE (3A ISERM)
	"246":  "",                                            // [à vérifier sc=0.72] 9.4P ABATTAGE MECA ET EXPLOSIF (3A ISERM) | candidat: 9.4 - ABATTAGE
	"1319": "",                                            // [à vérifier sc=0.82] 9.4P MARINAGE (3A ISERM) | candidat: ISERM - 9.6.3P : MARINAGE
	"1318": "ISERM - 9.2.4 : OUVRAGES SOUTERRAINS",        // [auto·moyenne sc=1.0] 9.4P OUVRAGES SOUTERRAINS (3A ISERM)
	"247":  "",                                            // [à vérifier sc=0.83] 9.4P SOUTENEMENT (3A ISERM) | candidat: ISERM - 9.6.2P : SOUTENEMENT
	"1504": "ISERM 9.5.5P - MÉTHODES DE CARACTÉRISATION",  // [auto·moyenne sc=0.89] 9.5P  METHODES DE CARACTERISATION (3A ISERM)
	"1503": "ISERM 9.5.4P - ACCEPTABILITÉ SOCIÉTALE",      // [auto·moyenne sc=0.89] 9.5P ACCEPTABILITE SOCIETALE (3A ISERM)
	"965":  "ISERM - 10.2.2 : GESTION DE L'ENVIRONNEMENT", // [auto·moyenne sc=0.89] 9.5P GESTION DE L'ENVIRONNEMENT (3A ISERM)
	"944":  "",                                            // [à vérifier sc=0.83] 9.5P GESTION EAUX ET RESIDUS (3A ISERM) | candidat: ISERM 9.5.3P - GESTION DES EAUX ET DES RÉSIDUS DE TRAITEMENT
	"943":  "ISERM - 10.2.1 : VALORISATION DES MINERAIS",  // [auto·moyenne sc=0.89] 9.5P VALORISATION DES MINERAIS (3A ISERM)
	"940":  "",                                            // [à vérifier sc=0.81] 9.6P SURPAC (3A ISERM) | candidat: ISERM - 10.1.1 : SURPAC

	// ┌─ 3A MKX  (15/27 mappés) ──────────────────────────────────────────────────
	"1262": "",                                                              // [événement] REMISE EN ETAT ROBOT (3A MKX)
	"1974": "",                                                              // [événement] SOUTENANCE PROJET RECHERCHE (3A MKX)
	"2024": "",                                                              // [événement] SOUTENANCES FINALES ET DEMONSTRATIONS (3A MKX)
	"632":  "9.1-MKX-2M-PROCÉDÉS DE FABRICAT° ET SÉLECT° MATERIAUX",         // [auto·moyenne sc=0.87] 9.1 - PROCEDES FABRIC ET SELEC MATERIAUX (3A MKX)
	"1843": "9.1-MKX-2M-PROPRIETES ET STRUCTURES DES MATERIAUX",             // [auto·moyenne sc=0.99] 9.1 - PROPRIETES ET STRUCTURE MATERIAUX (3A MKX)
	"635":  "9.1-MKX-2M-SIMULATION MULTI-DOMAINES",                          // [auto·moyenne sc=0.98] 9.1 - SIMULAT MULTI-DOMAINES(BOND-GRAPH (3A MKX)
	"634":  "9.1-MKX-2M-SIMULATION MULTI-PHYSIQUES",                         // [auto·haute sc=1.26] 9.1 - SIMULATION MULTI-PHYSIQUES (3A MKX)
	"1491": "9.2-MKX-2M-BASES DE DONNÉES",                                   // [auto·haute sc=1.23] 9.2 - BASES DE DONNEES (3A MKX)
	"1490": "9.2-MKX-EAI-ROBOT OPERATING SYSTEM (ROS)",                      // [auto·haute sc=1.26] 9.2 - ROBOT OPERATING SYSTEM (ROS) (3A MKX)
	"633":  "9.2-MKX-2M-ROBOTIQUE INDUSTRIELLE",                             // [auto·haute sc=1.24] 9.2 - ROBOTIQUE INDUSTRIELLE (3A MKX)
	"1141": "9.3-A-MKX-EAI-CIRCUITS LOGIQUES PROGRAMMABLES (FPGA)",          // [auto·moyenne sc=0.87] 9.3 A - FPGA CIRC LOGIQUES PROGRAMMABLES (3A MKX)
	"1492": "9.3-B-MKX-ISPI-METHODE 6 SIGMA",                                // [auto·haute sc=1.22] 9.3 B - METHODE 6 SIGMA (3A MKX)
	"1494": "9.3-B-MKX-ISPI-PROJET SMED",                                    // [auto·haute sc=1.21] 9.3 B - PROJET SMED (3A MKX)
	"640":  "9.4-MKX-ISPI-MODÉLISAT° ET AUTOMATISAT° DES PROCESSUS MÉTIERS", // [auto·moyenne sc=0.86] 9.4 - MODELISAT AUTOMAT PROCESS METIERS (3A MKX)
	"1495": "9.4-PI-PILOTAGE DE FLUX ET SI",                                 // [auto·haute sc=1.23] 9.4 - PILOTAGE DE FLUX (3A MKX)
	"2008": "",                                                              // [à vérifier sc=0.74] 9.5 A - P FIL-ROUGE-REVUE TECH INFO (3A MKX) | candidat: 9.5-A-MKX-PROJ-PROJET FIL ROUGE
	"2007": "",                                                              // [à vérifier sc=0.74] 9.5 A - P FIL-ROUGE-REVUE TECH MECA (3A MKX) | candidat: 9.5 INFRES-PROJ PROJET FIL ROUGE/PROJET RECHERCHE
	"1956": "",                                                              // [à vérifier sc=0.74] 9.5 A - P FIL-ROUGE-REVUE TECHNI ELEC (3A MKX) | candidat: 9.5 INFRES-PROJ PROJET FIL ROUGE/PROJET RECHERCHE
	"1955": "",                                                              // [à vérifier sc=0.81] 9.5 A - P FIL-ROUGE-REVUE TECHNIQUE (3A MKX) | candidat: 9.5-A-MKX-PROJ-PROJET FIL ROUGE
	"641":  "9.5-IS-PROJET IVTVQ ÉVALUATION",                                // [auto·haute sc=1.35] 9.5 A - PROJET IVTVQ EVALUATION (3A MKX)
	"1130": "9.5-A-MKX-PROJ-PROJET FIL ROUGE",                               // [auto·haute sc=1.35] 9.5 A - PROJET MKX - FIL ROUGE (3A MKX)
	"1844": "9.5-B-MKX-PROJ-PROJET RECHERCHE",                               // [auto·haute sc=1.35] 9.5 B - PROJET MKX - RECHERCHE (3A MKX)
	"1695": "",                                                              // [à vérifier sc=0.82] 9.6  - DPPA - GESTION DU CHANGEMENT (3A MKX) | candidat: 9.6-DIM-GESTION DE PROJET (SIMULTRAIN)
	"855":  "",                                                              // [à vérifier sc=0.8] 9.6  - DPPA - MISSION 6 PRESENTA (3A MKX) | candidat: 9.6 INFRES DPPA : MISSION 5
	"992":  "",                                                              // [à vérifier] 9.6 - DPPA - 1ER CONTRAT DE TRAVAIL (3A MKX)
	"1803": "",                                                              // [à vérifier] 9.6 - DPPA - DEVELO COMPE NTERCULTUREL (3A MKX)
	"1696": "",                                                              // [à vérifier] 9.6 - DPPA -COMMUNICAT  INTERPERSONNELLE (3A MKX)

	// ┌─ 3A PRISM  (13/29 mappés) ────────────────────────────────────────────────
	"863":  "",                                                     // [à vérifier sc=0.83] 10.1.1. INTELLIGENCE ARTIFICIELLE (3A PRISM) | candidat: SYM- 10.1.1 INTELLIGENCE ARTIFICIELLE
	"864":  "",                                                     // [à vérifier sc=0.85] 10.1.2. INTERNET DES OBJETS IOT (3A PRISM) | candidat: SYM - 10.1.2 INTERNET DES OBJETS IOT
	"895":  "",                                                     // [à vérifier sc=0.78] 10.2. ENSEIGNEMENTS ELECTIFS (3A PRISM) | candidat: SYM - 10.2.5 ENSEIGNEMENTS ELECTIFS ROS
	"865":  "",                                                     // [à vérifier sc=0.69] 10.2.1. SYSTEME D'EXPLOITATION ENTREPRIS (3A PRISM) | candidat: SYSTEME D'EXPLOITATION
	"1584": "",                                                     // [à vérifier] 10.2.2 SYNTEME INFO ENT ERP GESTION SCM (3A PRISM)
	"868":  "",                                                     // [à vérifier] 10.3. PDI (3A PRISM)
	"953":  "",                                                     // [à vérifier sc=0.82] 10.3.1. USINAGE ET PROTOTYPAGE (3A PRISM) | candidat: SYM - 10.3.1 - USINAGE ET PROTOTYPAGE
	"954":  "",                                                     // [à vérifier] 10.3.2. PDII (3A PRISM)
	"625":  "GITN - 9.1.1 - SOUTIEN LOGISTIQUE INTEGRE",            // [auto·moyenne sc=0.91] 9.1.1.SOUTIEN LOGISTIQUE INTEGRE (3A PRISM)
	"359":  "M8.3  VIBRATION DES STRUCTURES 1",                     // [auto·moyenne sc=0.89] 9.1.2. VIBRATION DES STRUCTURES (3A PRISM)
	"626":  "",                                                     // [à vérifier sc=0.7] 9.1.2.DEPLOIEMENT INGENIERIE SYSTEME ENT (3A PRISM) | candidat: GITN - 9.1.2 - DEPLOIEMENT DE L INGENIERIE SYSTEME EN ENTREPRISE
	"362":  "SYM - 9.1.2 - PROPRIETES ET SELECTION DES MATERIAUX",  // [auto·moyenne sc=0.91] 9.1.3. PROPRIETES ET SELECTION MATERIAUX (3A PRISM)
	"369":  "SYM - 9.2.1 - METHODE EFI",                            // [auto·moyenne sc=0.87] 9.2.1. METHODE EFI (3A PRISM)
	"394":  "GITN - 9.2.1 SUPPLY CHAIN MANAGEMENT (SCM)",           // [auto·moyenne sc=0.91] 9.2.1. SUPPLY CHAIN MANAGEMENT (3A PRISM)
	"1128": "",                                                     // [à vérifier sc=0.49] 9.2.2. MODEL DRIVEN DESIGN (3A PRISM) | candidat: SYM - 9.2.2 CONCEPTION DIRIGEE PAR LES MODELES (MBD)/MODEL BASED DESIGN (MBD)
	"154":  "SIMULATION",                                           // [auto·moyenne sc=1.0] 9.2.2. SIMULATION (3A PRISM)
	"627":  "",                                                     // [événement] 9.3. CHALLENGE ROBAFIS (3A PRISM)
	"364":  "MKX 9.1 ACTIONNEURS POUR LA MECATRONIQUE",             // [auto·moyenne sc=1.0] 9.3.1. ACTIONNEURS POUR LA MECATRONIQUE (3A PRISM)
	"395":  "SYM - 9.3.2 - CAPTEURS ET INTERFACES",                 // [auto·moyenne sc=0.88] 9.3.2. CAPTEURS ET INTERFACES (3A PRISM)
	"1483": "",                                                     // [à vérifier sc=0.5] 9.3.3  ELECTRONIQUE ANALOGIQUE (3A PRISM) | candidat: SYM - 9.3.3 - ELECTRONIQUE ANALOGIQUE
	"517":  "SYM - 9.4.1 - LANGAGES DE DEVELOPPEMENT",              // [auto·moyenne sc=0.88] 9.4.1. LANGAGES DE DEVELOPPEMENT (3A PRISM)
	"255":  "GITN - 9.4.1 - SYSTEME DE PLANIFICATION AVANCE (APS)", // [auto·moyenne sc=0.91] 9.4.1. SYSTEME DE PLANIFICATION AVANCE (3A PRISM)
	"361":  "",                                                     // [événement] 9.4.2. ARCHITECTURE DES MICROCONTROLEURS (3A PRISM)
	"406":  "",                                                     // [événement] 9.4.2. INTEROPERABILITE ET INTEGRATION (3A PRISM)
	"462":  "SYM - 9.5.1 - CONDUITE DE PROJET MECATRONIQUE",        // [auto·moyenne sc=0.91] 9.5.1. CONDUITE DE PROJET MECATRONIQUE (3A PRISM)
	"261":  "",                                                     // [à vérifier sc=0.57] 9.5.1. DECISION MAKING SUPPORT FOR ENT (3A PRISM) | candidat: GITN - 9.5.1 AIDE A LA DECISION ET APPROCHES POUR LA GESTION D'ENTREPRISE/DECISION MAKING SUPPORT AND APPROACHES FOR ENTERPRISE MANAGEMENT
	"257":  "9.4-PI-LEAN MANAGEMENT",                               // [auto·moyenne sc=0.92] 9.5.2. LEAN MANAGEMENT (3A PRISM)
	"628":  "",                                                     // [à vérifier sc=0.61] 9.5.2. PROJET DEV.INDUSTRIEL INTERDISCIP (3A PRISM) | candidat: 9.5.2. PROJET FIL ROUGE/RECHERCHE-2
	"212":  "9.3-B-MKX-ISPI-METHODE 6 SIGMA",                       // [auto·moyenne sc=0.91] 9.5.3. METHODE 6 SIGMA (3A PRISM)

	// ┌─ AUCUN  (0/1 mappés) ───────────────────────────────────────────────────
	"872": "", // [à vérifier] (AUCUN)

	// ┌─ AUTRE  (17/99 mappés) ───────────────────────────────────────────────────
	"25":   "",                                               // [à vérifier] -
	"382":  "",                                               // [événement] ACCUEIL
	"10":   "5.6-ANGLAIS",                                    // [auto·moyenne sc=1.0] ANGLAIS
	"1685": "",                                               // [événement] ATELIER REMISE A NIVEAU
	"682":  "",                                               // [à vérifier sc=0.46] BILAN PERIODE | candidat: BILAN CARBONE
	"407":  "",                                               // [à vérifier] BRIEFING
	"526":  "",                                               // [à vérifier sc=0.5] CONSEIL DE LA RECHERCHE | candidat: 9.5-B-MKX-PROJ-PROJET RECHERCHE
	"2040": "CYBERSECURITE",                                  // [auto·moyenne sc=1.0] CYBERSECURITE FISE
	"629":  "",                                               // [à vérifier] DEBRIEFING
	"1109": "",                                               // [événement] ECOLE FERMEE
	"461":  "",                                               // [à vérifier sc=0.8] FABRICATION ADDITIVE | candidat: MKX 9.3 PROJET D'USINAGE ET DE FABRICATION ADDITIVE
	"1388": "",                                               // [événement] FERIE
	"624":  "",                                               // [événement] FORUM ENTREPRISES
	"39":   "",                                               // [à vérifier] INTERCULTURALITE (2A FISE (S7))
	"2091": "",                                               // [à vérifier] JOB DATING
	"1294": "",                                               // [événement] JOUR FERIE
	"1795": "",                                               // [événement] JOURNEE DE COHESION
	"1264": "",                                               // [événement] JOURNEE DE LA RECHERCHE
	"683":  "",                                               // [à vérifier] LANCEMENT PERIODE
	"11":   "LV2",                                            // [auto·moyenne sc=1.0] LV2
	"1846": "",                                               // [à vérifier] PERMANENCE DPPA
	"522":  "",                                               // [à vérifier sc=0.47] PERMANENCE RH | candidat: MANAGEMENT RH
	"1764": "",                                               // [événement] PRESENTATION
	"375":  "",                                               // [événement] PRESENTATION DES ASSOCIATIONS
	"1149": "PROFIL METIER",                                  // [auto·moyenne sc=1.0] PROFIL METIER
	"47":   "6.5.2 PROJ - PROJET",                            // [auto·moyenne sc=1.0] PROJET
	"851":  "",                                               // [événement] PROJET - TRAVAIL EN AUTONOMIE
	"1456": "",                                               // [événement] RATTRAPAGE
	"1984": "",                                               // [événement] REMISE DES TABLETTES
	"807":  "",                                               // [événement] RENCONTRE AVEC LE SERVICE PEDAGOGIQUE
	"1523": "",                                               // [événement] RENCONTRE ELEVES
	"459":  "",                                               // [événement] RENTREE 3A
	"1343": "",                                               // [événement] RENTREE CLIMAT
	"250":  "",                                               // [événement] RENTREE ISERM
	"2009": "",                                               // [à vérifier] RESTITUTION DE LENQUETE RESPECT EGALITE
	"889":  "",                                               // [événement] REUNION DE RENTREE
	"1342": "",                                               // [à vérifier] SENSIBILISATION SURALCOOLISATION
	"1313": "",                                               // [événement] SENSIBILISATION VSS/FORUM ASSOCIATIONS
	"258":  "",                                               // [à vérifier sc=0.49] SORTIE TERRAIN | candidat: FCD 8.4 - MISSION DE TERRAIN
	"521":  "",                                               // [événement] SOUTENANCE PFE
	"221":  "SOUTENANCES",                                    // [auto·moyenne sc=1.0] SOUTENANCES
	"16":   "",                                               // [à vérifier sc=0.77] SPORT | candidat: 10.1 MATÉRIAUX  ET SPORT
	"1699": "",                                               // [événement] TRAVAIL EN AUTONOMIE
	"2001": "",                                               // [à vérifier sc=0.46] TRAVAIL PERSONNEL | candidat: DEVELOPPEMENT PERSONNEL
	"794":  "",                                               // [événement] VISITE
	"1891": "",                                               // [à vérifier] 6.4 RSE
	"121":  "FCD 8.2 - ROP",                                  // [auto·moyenne sc=1.0] 7.1.1 / ROP (2A FISE (S7))
	"120":  "",                                               // [à vérifier sc=0.78] 7.1.2 / EFI (2A FISE (S7)) | candidat: TC-7.1 EFI 2 -
	"122":  "",                                               // [à vérifier sc=0.47] 7.1.3 / EFI APP (2A FISE (S7)) | candidat: EFI - PHASE 2 (APPROFONDISSEMENT)
	"123":  "",                                               // [à vérifier sc=0.52] 7.1.3 / ROP APP (2A FISE (S7)) | candidat: FCD 8.2 - ROP
	"1462": "",                                               // [à vérifier sc=0.47] 7.2.01 / UEE ANALYSE ARCHITECTURALE (2A FISE (S7)) | candidat: 6.5-ANALYSE ARCHITECTURALE
	"278":  "",                                               // [à vérifier] 7.2.02 / UEE DESIGN THINKING (2A FISE (S7))
	"160":  "",                                               // [à vérifier sc=0.52] 7.2.03 / UEE EAU (2A FISE (S7)) | candidat: EAU
	"156":  "",                                               // [à vérifier sc=0.46] 7.2.04 / UEE GEOSCIENCES (2A FISE (S7)) | candidat: TC-6-6 UE ELECTIVE GEOSCIENCES -
	"1778": "",                                               // [à vérifier sc=0.54] 7.2.05 / UEE MATHS (2A FISE (S7)) | candidat: MATHS
	"1968": "",                                               // [à vérifier sc=0.53] 7.2.06 / UEE NUCLEAIRE (2A FISE (S7)) | candidat: SURETE NUCLÉAIRE
	"1969": "",                                               // [à vérifier] 7.2.07 / UEE OUVRAGES MACONNES HISTO. (2A FISE (S7))
	"712":  "",                                               // [à vérifier] 7.2.08 / UEE PLANS D'EXPERIENCES (2A FISE (S7))
	"162":  "",                                               // [à vérifier sc=0.48] 7.2.09 / UEE RECI (2A FISE (S7)) | candidat: TC-5.6 RECI -
	"1779": "",                                               // [à vérifier] 7.2.10 / UEE RESILIENCE (2A FISE (S7))
	"163":  "",                                               // [à vérifier] 7.2.11 / UEE TRANSF DIGITALE ENTREPRISES (2A FISE (S7))
	"159":  "",                                               // [à vérifier] 7.2.12 / UEE VISION (2A FISE (S7))
	"1180": "",                                               // [à vérifier sc=0.6] 7.3 / 2IA - FONDEMENTS SYST. ET DEV. (2A FISE (S7)) | candidat: 7.3-B-MKX-ISPI-SYST INFORMATION ENTREPRIS (ERP) GEST° CHAINE LOGIST (SCM)
	"1710": "",                                               // [à vérifier sc=0.75] 7.3 / 2IA - INGENIERIE DES EXIGENCES (2A FISE (S7)) | candidat: 6.4-INGENIERIE DES EXIGENCES
	"1711": "",                                               // [à vérifier] 7.3 / 2IA - PROGR ORIENTEE OBJETS (2A FISE (S7))
	"1176": "",                                               // [à vérifier] 7.3 / ECOMAP - ELASTICITE LINEAIRE ANISO (2A FISE (S7))
	"279":  "",                                               // [à vérifier] 7.3 / ECOMAP - SOCIOLOGIE DES MOLECULES (2A FISE (S7))
	"1173": "",                                               // [à vérifier sc=0.59] 7.3 / GCBD - RDM AVANCEE - ESI (2A FISE (S7)) | candidat: 7.3 INFRES STS SR : BASES DE DONNEES ADMINISTRATION AVANCEE
	"37":   "",                                               // [à vérifier] 7.3 / GCBD-PRISM - MECA GENERALE (2A FISE (S7))
	"1177": "",                                               // [à vérifier sc=0.77] 7.3 / I2ER - BASES COMBUSTION (2A FISE (S7)) | candidat: 7.3 INFRES-ASSI-DL BASES DE DONNÉES
	"284":  "",                                               // [à vérifier sc=0.45] 7.3 / I2ER - ECOULEMENTS POLY (2A FISE (S7)) | candidat: 7.3-CMC-ENR ECLAIREMENT NATUREL
	"280":  "",                                               // [à vérifier] 7.3 / I2ER-ECOMAP - INT EVAL ENVIRON (2A FISE (S7))
	"1187": "",                                               // [à vérifier sc=0.48] 7.3 / ISERM - COMPOSANTES MINERALES 1 (2A FISE (S7)) | candidat: RESSOURCES MINÉRALES
	"1707": "",                                               // [à vérifier sc=0.48] 7.3 / ISERM - COMPOSANTES MINERALES 2 (2A FISE (S7)) | candidat: RESSOURCES MINÉRALES
	"288":  "MODELISATION DES SYSTEMES D'INFORMATION",        // [auto·moyenne sc=0.86] 7.3 / PRISM - MODELISATION DES SYSTEMES (2A FISE (S7))
	"215":  "TC-7.4 MANAGEMENT DE PROJET - SIMULTRAIN -",     // [auto·moyenne sc=0.91] 7.4 / MANAGEMENT PROJET - SIMULTRAIN (2A FISE (S7))
	"165":  "",                                               // [à vérifier] 7.5 ARCHITECTURE SCHEMA DIRECTEUR S.I. (2A FISE (S7))
	"1851": "",                                               // [à vérifier sc=0.47] 7.5 BUSINESS MODEL /  BUSINESS PLAN (2A FISE (S7)) | candidat: TC-6.4 BUSINESS MODEL -
	"695":  "",                                               // [à vérifier sc=0.63] 7.5 MODELISATION MAITRISE PROCESSUS (2A FISE (S7)) | candidat: TC-7.6 MODELISATION ; MAITRISE PROCESSUS
	"1946": "",                                               // [à vérifier sc=0.5] 7.5.1 / PRODUCTION INDUSTRIELLE (LM -SC) (2A FISE (S7)) | candidat: SUPERVISION INDUSTRIELLE
	"1948": "METHODES RESOLUTION DE PROBLEMES COMBINATOIRES", // [auto·moyenne sc=0.89] 7.5.2 / METHODES RESOLUTION DE PROBLEMES (2A FISE (S7))
	"1949": "",                                               // [à vérifier sc=0.5] 7.5.3 / AUDIT ET DIAGNOSTIC (2A FISE (S7)) | candidat: AUDIT DES SI
	"1947": "",                                               // [à vérifier] 7.5.4 / SYSTEMES D'INFO. INDUSTRIELS (2A FISE (S7))
	"910":  "FCD 8.4 - MISSION DE TERRAIN",                   // [auto·moyenne sc=1.0] 7.6 / MISSION DE TERRAIN (2A FISE (S7))
	"1817": "7.7-MKX-ANG-ANGLAIS",                            // [auto·haute sc=1.22] 7.7.1 / ANGLAIS (2A FISE (S7))
	"1818": "LV2",                                            // [auto·moyenne sc=1.0] 7.7.2 / LV2 (2A FISE (S7))
	"1819": "",                                               // [à vérifier] 7.7.3 / INTERCULTURALITE (2A FISE (S7))
	"1175": "",                                               // [à vérifier] 7.9 / GCBD - RDM NUMERIQUE (2A FISE (S7))
	"2003": "",                                               // [à vérifier sc=0.53] 7.9 / I2ER - ECOULEMENTS ET COMBUSTION (2A FISE (S7)) | candidat: COMBUSTION
	"1909": "",                                               // [à vérifier] 8.2
	"174":  "",                                               // [à vérifier sc=0.83] 9.1 FILIERE METIER (3A FISE (Profils métiers)) | candidat: 9.1 - 1 - PROFIL MÉTIER
	"1151": "9.1.1. SOBRIÉTÉ NUMÉRIQUE : GREEN IT",           // [auto·haute sc=1.08] 9.1.1. SOBRIETE NUM : GREEN IT
	"104":  "9.1.2. OPEN SOURCE",                             // [auto·haute sc=1.35] 9.1.2. OPEN SOURCE
	"1143": "9.1.3. VEILLE TECHNOLOGIQUE",                    // [auto·haute sc=1.35] 9.1.3. VEILLE TECHNOLOGIQUE
	"1966": "9.5.1. SR - SOLUTIONS CLOUDS",                   // [auto·haute sc=1.35] 9.5.1. SOLUTIONS CLOUDS
	"1689": "",                                               // [à vérifier sc=0.52] 9.7 DPPA /COMMUNICATION INTERPERSONNELLE | candidat: COMMUNICATION
	"1572": "",                                               // [à vérifier sc=0.67] 9.7 DPPA /DVLPMT COMPETENCES INTERCULT. | candidat: 9.7-MKX-DPPA- MISSION 5 : BILAN DE COMPÉTENCES
	"1571": "",                                               // [à vérifier sc=0.54] 9.7 DPPA /GESTION DU CHANGEMENT | candidat: 5.6-DIM-GESTION DE PROJET ET CONDUITE DU CHANGEMENT
	"114":  "",                                               // [à vérifier sc=0.46] 9.7 DPPA /PREPARATION 1ER CONTRAT | candidat: 9.7-EE-EVALUATION ENTREPRISE

	// ┌─ FORMATION PERSONNEL  (0/1 mappés) ─────────────────────────────────────
	"2090": "", // [événement] REUNION STAGES (FORMATION PERSONNEL)

	// ┌─ Salles Alès 2025-26  (1/11 mappés) ─────────────────────────────────────
	"1592": "",           // [événement] CONTRÔLE (Salles Alès 2025-26)
	"650":  "",           // [événement] CONTRÔLE DE RATTRAPAGE (Salles Alès 2025-26)
	"1896": "",           // [à vérifier] FORMATION INTERNE (Salles Alès 2025-26)
	"2083": "",           // [à vérifier] RECUPERATION DES TABLETTES (Salles Alès 2025-26)
	"649":  "",           // [événement] REMISE A NIVEAU (Salles Alès 2025-26)
	"651":  "",           // [événement] REUNION (Salles Alès 2025-26)
	"1407": "",           // [événement] REUNION - THESE (Salles Alès 2025-26)
	"891":  "",           // [événement] REUNION DEPARTEMENT 2IA (Salles Alès 2025-26)
	"1102": "",           // [événement] REUNION TRAVAIL (Salles Alès 2025-26)
	"1697": "SOUTENANCE", // [auto·moyenne sc=1.0] SOUTENANCE (Salles Alès 2025-26)
	"1186": "",           // [événement] SOUTENANCE THESE (Salles Alès 2025-26)
}
