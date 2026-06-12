package utils

import (
	"fmt"
	"time"
)

type TimeRange struct {
	Start time.Time
	End   time.Time
}

func ForceTime(matin bool, t time.Time) time.Time {
	// Créer une nouvelle date en utilisant l'année, le mois et le jour de la date d'origine
	if matin {
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
	} else {
		return time.Date(t.Year(), t.Month(), t.Day(), 23, 59, 0, 0, t.Location())
	}

}

func alignToPreviousSunday(date time.Time) time.Time {

	// Obtenir le jour de la semaine (lundi = 0, dimanche = 6)
	dayOfWeek := int(date.Weekday())

	// Calculer le nombre de jours à soustraire pour atteindre le dimanche précédent
	daysToSubtract := dayOfWeek

	// Soustraire les jours pour obtenir le dimanche précédent
	previousSunday := date.AddDate(0, 0, -daysToSubtract)

	return previousSunday
}

func GetWeeksBetweenDates(start, end time.Time) ([]TimeRange, error) {

	start = alignToPreviousSunday(start)

	// Calculer la différence en jours
	diff := end.Sub(start)

	days := int(diff.Hours() / 24)

	// Calculer le nombre de semaines complètes
	weeks := days / 7

	// Construire la liste des semaines
	var weekList []TimeRange
	for i := 0; i <= weeks; i++ {
		// Calculer le début de la semaine i
		weekStart := start.AddDate(0, 0, i*7)
		// Calculer la fin de la semaine i
		weekEnd := weekStart.AddDate(0, 0, 6)
		weekEnd = ForceTime(false, weekEnd)
		// Formater les dates et ajouter à la liste
		weekList = append(weekList, TimeRange{Start: weekStart, End: weekEnd})
	}

	return weekList, nil
}

func EnumerateDays(startDate, endDate time.Time) []time.Time {
	dates := []time.Time{}
	for date := startDate; !date.After(endDate); date = date.AddDate(0, 0, 1) {
		dates = append(dates, date)
	}
	return dates
}

func CloneDate(original time.Time) time.Time {
	return time.Date(original.Year(), original.Month(), original.Day(),
		original.Hour(), original.Minute(), original.Second(), original.Nanosecond(), original.Location())

}

func GetMonthBetweenDates(startDate, endDate time.Time) ([]TimeRange, error) {
	// Vérifier que la date de début est avant la date de fin
	if startDate.After(endDate) {
		return nil, fmt.Errorf("la date de début doit être avant la date de fin")
	}

	var periodes []TimeRange

	// Afficher les périodes (début et fin de mois) entre les deux dates
	currentDate := startDate
	for currentDate.Before(endDate) || currentDate.Equal(endDate) {
		// Début du mois
		startOfMonth := time.Date(currentDate.Year(), currentDate.Month(), 1, 0, 0, 0, 0, time.UTC)

		// Fin du mois
		nextMonth := startOfMonth.AddDate(0, 1, 0)
		endOfMonth := nextMonth.AddDate(0, 0, -1)

		periodes = append(periodes, TimeRange{
			Start: startOfMonth,
			End:   endOfMonth,
		})

		// Passer au mois suivant
		currentDate = nextMonth
	}

	return periodes, nil
}
