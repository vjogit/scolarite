package templates

import _ "embed"

// TemplateNote est le classeur modèle de la fiche de notes, embarqué dans le
// binaire : un chemin de système de fichiers n'existe ni dans les conteneurs
// ni sur une autre machine.
//
//go:embed Template_note.xlsx
var TemplateNote []byte
