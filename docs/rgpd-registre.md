# Registre chaîné des notes et délibérations — note RGPD

Cette note tient lieu de fiche de traitement pour le registre chaîné
(traçabilité des notes de contrôle et des résultats de jury) et consigne les
décisions de conception qui rendent le registre **conforme par construction**.
Les durées de conservation qu'elle fixe sont des propositions argumentées :
chacune reste **à valider par le DPO** avant toute mise en production.

## Le traitement

| | |
|---|---|
| Finalité | Détecter et imputer toute création, modification ou destruction d'une note ou d'un résultat de jury — y compris par une personne qui en a le droit et voudrait effacer ses traces. |
| Base légale | Mission d'intérêt public (art. 6.1.e RGPD) : fiabilité des résultats qui fondent les décisions de jury. Imputabilité des écritures : Code civil, art. 1366 (l'écrit électronique vaut preuve si son auteur est identifié et son intégrité garantie). |
| Personnes concernées | Élèves (leurs notes et résultats) **et personnels** (voir « Les personnels sont tracés »). |
| Mécanisme | Chaîne de maillons SHA-256 : chaque maillon inclut le hash du précédent (`prev_hash`), toute altération a posteriori casse la chaîne et se détecte par recalcul intégral (`VerifyChain`). Écritures sérialisées par verrou transactionnel PostgreSQL. |
| Destinataires | Aucun destinataire externe. Quand l'ancrage RFC 3161 sera câblé, **seul le hash de tête** (32 octets, dont aucune donnée personnelle n'est déductible) transitera vers l'autorité d'horodatage — ce patron est contractuel dès maintenant dans la conception du schéma. |

## Contenu d'un maillon — minimisation (art. 5.1.c)

Le maillon ne contient **jamais de texte libre ni de donnée nominative** :
uniquement des identifiants techniques (`note_id`, `user_id`, `controle_id`,
`periode_id`, `unite_enseignement_id`), des valeurs numériques, des drapeaux,
le `sub` Keycloak de l'auteur et des horodatages.

La remarque libre d'une note peut receler des données de santé (art. 9 :
« absente — hospitalisation ») : elle n'entre dans le maillon que par son
**SHA-256** (`remarque_hash`). Le texte lui-même vit dans la table `note`,
soumise à sa propre durée de rétention, courte. C'est cette règle qui autorise
la conservation longue du registre : tous ses champs supportent la durée de la
catégorie la plus longue qu'il contient.

## Pseudonymisation révocable — droit à l'effacement (art. 17)

La ligne `user` (nom, prénom, email, `keycloak_id`) est la **correspondance**
entre les identifiants du registre et une personne. L'effacement d'une
personne détruit cette correspondance, **jamais les maillons** : la chaîne
reste intègre et vérifiable, ses identifiants ne résolvent simplement plus.

L'effacement anticipé ne s'applique qu'aux données hors obligation de
conservation : les résultats de jury en sont exemptés pendant leur durée de
rétention (art. 17.3.b).

## Durées de conservation (art. 5.1.e) — à valider par le DPO

| Catégorie | Durée proposée | Base proposée |
|---|---|---|
| Notes de contrôle (table `note`) | Fin de scolarité + 1 an | Durée d'utilité administrative : délais de recours contentieux contre une évaluation. Le détail des contrôles n'a plus d'usage une fois la période délibérée et le délai éteint. |
| Résultats de jury (`jury_result`) | 50 ans après délibération | Délivrance de relevés et d'attestations tout au long de la vie professionnelle ; pratique archivistique des établissements d'enseignement (Code du patrimoine, L211-4). Exemption d'effacement : art. 17.3.b. |
| Maillons du registre | 50 ans — alignés sur la catégorie la plus longue qu'il contient | La chaîne est indivisible : expurger un maillon casserait l'intégrité. Licéité de la conservation longue garantie par la minimisation (aucun texte libre, aucune donnée nominative). |
| Correspondance `user` — élèves | 50 ans si l'élève a des résultats délibérés (une attestation sans nom ne sert personne) ; sinon fin de scolarité + 1 an. Destruction anticipée sur demande art. 17 quand aucune obligation ne s'y oppose. | Art. 5.1.e et 17.3.b. |
| Correspondance `user` — agents | Ligne `user` : durée de fonction + 5 ans (prescription). Le `sub` dans les maillons : durée du registre. | Art. 6.1.e ; C. civ. 1366 — l'imputabilité est la finalité même du champ. |

Point signalé au DPO : `fk_jury_result_user` est aujourd'hui en
`ON DELETE CASCADE` — détruire une ligne `user` détruit aussi ses résultats de
jury, en contradiction avec la rétention de 50 ans ci-dessus. Ce CASCADE devra
être repensé ; c'est hors périmètre du registre, mais la présente note l'expose.

## Droits des personnes — des mécanismes, pas des promesses

- **Accès (art. 15)** : extraction de tous les maillons portant le `user_id`
  d'un élève — le registre est indexé pour cela. Chaque maillon est
  autoportant (« 12 → 15, par tel auteur, à telle date » se lit d'un seul
  maillon, sans reconstruction).
- **Rectification (art. 16)** : toujours par **nouveau maillon**, jamais par
  réécriture. Pour une note, une modification — y compris de la seule
  remarque, dont le motif peut être à rectifier — produit un maillon
  `note.update`. Pour un jury, re-délibérer produit de nouveaux maillons.
- **Effacement (art. 17)** : destruction de la correspondance, voir plus haut.

## Les personnels sont tracés

Chaque maillon porte le `sub` Keycloak de l'agent qui a effectué l'opération
(création, modification, suppression de note ; délibération, annulation).
C'est une donnée personnelle des personnels, collectée pour l'imputabilité
(C. civ. 1366) et conservée pendant toute la durée du registre. Les personnels
doivent en être informés (information des personnes, art. 13) ; la présente
fiche vaut documentation de cette collecte.

## Décisions de structure actées

1. **Une seule chaîne** pour les maillons de note et de jury : un ordre total
   entre les deux domaines rend prouvable, par la seule position des maillons,
   qu'une note a été modifiée *après* la délibération — le scénario de fraude
   central.
2. **Aucune clé étrangère** du registre vers les tables opérationnelles : la
   purge de la corbeille et l'effacement art. 17 détruisent légitimement des
   lignes que le registre doit survivre. Ses identifiants sont des entiers
   nus, résolubles tant que la correspondance existe.
3. **Les destructions en cascade écrivent des maillons** (`note.purge` pour la
   purge corbeille, `note.erase` et `jury.erase` pour l'effacement art. 17 —
   la destruction d'une ligne user emporte aussi ses résultats de jury par
   cascade) : rien ne disparaît sans que la chaîne dise pourquoi. Les volumes
   sont bornés : la purge est interdite sur une période délibérée.

## Formats canoniques (gelés après validation du tableau de rétention)

Séparateur `|`, ordre des champs contractuel, champ absent = chaîne vide.
Le séparateur est sûr parce que tous les champs texte sont des hex, des types
d'opération fermés ou un `sub` UUID — conséquence directe de la minimisation.
Horodatages tronqués à la microseconde avant insertion (contrat de
reproductibilité après aller-retour `timestamptz`).

Maillon de note (`op` ∈ `note.create`, `note.update`, `note.delete`,
`note.purge`, `note.erase`) :

    op|note_id|user_id|controle_id|old_note|new_note|not_evaluated|is_validated|remarque_hash|author_sub|event_at|recorded_at|prev_hash

Maillon de jury (`op` ∈ `jury.deliberate`, `jury.cancel`, `jury.erase`, un
maillon par UE dans les deux sens ; pour `jury.cancel` et `jury.erase` les
champs portent les valeurs détruites — le maillon reste autoportant) :

    op|user_id|periode_id|unite_enseignement_id|grade|gpa_index|ects|compte_cumul|author_sub|event_at|recorded_at|prev_hash

## Étages préparés, non câblés

Le schéma prépare l'ancrage RFC 3161 (`registre_ancre`) et les témoins
courriel (`registre_temoin`) sans les activer. Contrats déjà actés : seul le
hash de tête transite vers la TSA ; le témoin ne contient que des références
d'ancres (seq, hash, date, URL TSA) — aucune donnée personnelle ne quittera
l'établissement.
