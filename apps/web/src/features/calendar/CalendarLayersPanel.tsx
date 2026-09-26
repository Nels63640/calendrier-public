import { calendarCoverage, schoolZones, type CalendarLayers } from './public-calendars'
export function CalendarLayersPanel({
  value,
  onChange,
  onBirthday,
}: {
  value: CalendarLayers
  onChange: (value: CalendarLayers) => void
  onBirthday: () => void
}) {
  return (
    <section className="calendar-layers">
      <h3>Mes calendriers</h3>
      <p className="muted">
        Affichage sur cet appareil. Plusieurs zones peuvent être sélectionnées.
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={value.holidays}
          onChange={(e) => onChange({ ...value, holidays: e.target.checked })}
        />
        Jours fériés français
      </label>
      <details>
        <summary>
          Vacances scolaires{' '}
          {value.zones.length
            ? '· ' + value.zones.map((z) => 'Zone ' + z).join(', ')
            : '· Choisir ma zone'}
        </summary>
        <div className="school-zones">
          {Object.entries(schoolZones).map(([zone, cities]) => (
            <label key={zone}>
              <input
                type="checkbox"
                checked={value.zones.includes(zone)}
                onChange={(e) =>
                  onChange({
                    ...value,
                    zones: e.target.checked
                      ? [...value.zones, zone]
                      : value.zones.filter((z) => z !== zone),
                  })
                }
              />
              <span>
                <strong>Zone {zone}</strong>
                <small>{cities}</small>
              </span>
            </label>
          ))}
        </div>
        <p className="muted">
          Calendriers officiels jusqu’à l’été 2028. Les dates non publiées ne sont pas extrapolées.
          Les vacances commencent après la classe.
        </p>
      </details>
      <label className="check-label">
        <input
          type="checkbox"
          checked={value.birthdays}
          onChange={(e) => onChange({ ...value, birthdays: e.target.checked })}
        />
        Anniversaires
      </label>
      <button className="button" type="button" onClick={onBirthday}>
        Ajouter un anniversaire
      </button>
      <details className="calendar-sources">
        <summary>Sources et périodes couvertes</summary>
        <p>
          Jours fériés : {calendarCoverage.holidayYears[0]}–{calendarCoverage.holidayYears.at(-1)}.
          Vacances : données disponibles de 2025 à l’été 2028. Instantané du{' '}
          {calendarCoverage.updated}.
        </p>
        <a href="https://calendrier.api.gouv.fr/jours-feries/" target="_blank" rel="noreferrer">
          Jours fériés officiels
        </a>
        <br />
        <a
          href="https://www.education.gouv.fr/calendrier-scolaire-100148"
          target="_blank"
          rel="noreferrer"
        >
          Calendrier de l’Éducation nationale
        </a>
      </details>
    </section>
  )
}
