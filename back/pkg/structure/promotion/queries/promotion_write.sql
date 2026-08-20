-- name: CreatePromotion :one
INSERT INTO promotion ( name, debut, fin, echelle_gpa, echelle, bareme, matiere_eliminatoire, value_matiere_eliminatoire, formation_id)
      VALUES (@name, @debut, @fin, @echelle_gpa, @echelle, @bareme, @matiere_eliminatoire, @value_matiere_eliminatoire,@formation_id) RETURNING id;

-- name: UpdatePromotion :one
UPDATE promotion SET name = @name, debut = @debut, fin = @fin,
        echelle_gpa = @echelle_gpa, echelle = @echelle, bareme = @bareme, matiere_eliminatoire = @matiere_eliminatoire, value_matiere_eliminatoire = @value_matiere_eliminatoire, version = version + 1
    WHERE id = @id AND version = @version RETURNING version;
