-- cyber_notes.Realisation definition

CREATE TABLE `Realisation` (
  `NOCLEUNIK` int(11) NOT NULL AUTO_INCREMENT,
  `base` smallint(6) DEFAULT 0,
  `coefficient` float DEFAULT 0,
  `date` date DEFAULT NULL,
  `EVCLEUNIK` int(11) DEFAULT 0,
  `CTCLEUNIK` int(11) DEFAULT 0,
  `noteobtenue` float DEFAULT -1,
  `Nom_etablissement` varchar(50) DEFAULT NULL,
  `Adresse_etablissement` varchar(300) DEFAULT NULL,
  `Ville` varchar(50) DEFAULT NULL,
  `Pays` varchar(50) DEFAULT NULL,
  `Sujet` varchar(300) DEFAULT NULL,
  `Tuteur` varchar(50) DEFAULT NULL,
  `Commentaire` longtext DEFAULT NULL,
  `cp` bigint(20) DEFAULT 0,
  `duree` int(11) DEFAULT 0,
  PRIMARY KEY (`NOCLEUNIK`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=823362 DEFAULT CHARSET=utf8mb4;


-- cyber_notes.Exercice definition

CREATE TABLE `Exercice` (
  `CTCLEUNIK` int(11) NOT NULL AUTO_INCREMENT,
  `nom` varchar(150) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `base` smallint(6) DEFAULT 0,
  `coefficient` float DEFAULT 0,
  `P0CLEUNIK` int(11) DEFAULT 0,
  `IDTypeExercice` int(11) DEFAULT 0,
  `Supplement` tinyint(4) DEFAULT 0,
  `DureeEx` int(11) DEFAULT 0,
  `Commentaire` longtext DEFAULT NULL,
  PRIMARY KEY (`CTCLEUNIK`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=18692 DEFAULT CHARSET=utf8mb4;

-- cyber_notes.TypeExercice definition

CREATE TABLE `TypeExercice` (
  `IDTypeExercice` int(11) NOT NULL AUTO_INCREMENT,
  `nom` varchar(40) DEFAULT NULL,
  `description` longtext DEFAULT NULL,
  `Supplement` tinyint(4) DEFAULT 0,
  `Aff_haut` tinyint(3) unsigned DEFAULT 0,
  `Aff_bas` tinyint(3) unsigned DEFAULT 0,
  PRIMARY KEY (`IDTypeExercice`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4;

-- cyber_notes.promos definition

CREATE TABLE `promos` (
  `P0CLEUNIK` int(11) NOT NULL AUTO_INCREMENT,
  `nom` varchar(40) DEFAULT NULL,
  `afficher` tinyint(4) DEFAULT 0,
  `datedebut` date DEFAULT NULL,
  `datefin` date DEFAULT NULL,
  `IDNiveau` int(11) DEFAULT 0,
  `dateImpressionDiffusee` date DEFAULT NULL,
  `liensSupDiplome` longtext DEFAULT NULL,
  `texteSupDiplome` longtext DEFAULT NULL,
  PRIMARY KEY (`P0CLEUNIK`) USING BTREE,
  UNIQUE KEY `nom` (`nom`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=1138 DEFAULT CHARSET=utf8mb4;

-- cyber_notes.Niveau definition

CREATE TABLE `Niveau` (
  `IDNiveau` int(11) NOT NULL AUTO_INCREMENT,
  `nom` varchar(40) DEFAULT NULL,
  `description` longtext DEFAULT NULL,
  `couleurFond` bigint(20) DEFAULT 0,
  `couleurTexte` bigint(20) DEFAULT 0,
  `password` varchar(20) DEFAULT NULL,
  `colori` smallint(5) unsigned DEFAULT 0,
  `p0encours` int(11) DEFAULT 0,
  PRIMARY KEY (`IDNiveau`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4;

-- cyber_notes.eleves definition

CREATE TABLE `eleves` (
  `EVCLEUNIK` int(11) NOT NULL AUTO_INCREMENT,
  `det` varchar(5) DEFAULT NULL,
  `nom` varchar(40) DEFAULT NULL,
  `prenom` varchar(40) DEFAULT NULL,
  `mel` varchar(80) DEFAULT NULL,
  `type` varchar(40) DEFAULT NULL,
  `password` varchar(150) DEFAULT NULL,
  `typepassword` varchar(30) DEFAULT NULL,
  `INE` varchar(15) DEFAULT '0',
  PRIMARY KEY (`EVCLEUNIK`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=8727 DEFAULT CHARSET=utf8mb4;

-- cyber_notes.Promos_eleves definition

CREATE TABLE `Promos_eleves` (
  `EVCLEUNIK` int(11) DEFAULT 0,
  `P0CLEUNIK` int(11) DEFAULT 0,
  `Etat` int(11) DEFAULT 0,
  UNIQUE KEY `IDpromos_eleves` (`P0CLEUNIK`,`EVCLEUNIK`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


