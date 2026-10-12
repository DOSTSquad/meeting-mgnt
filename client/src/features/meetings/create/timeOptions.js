export const updateTimeOptionDurations = (options, { durationMinutes }) =>
  options.map((option) => ({
    ...option,
    endsAt: new Date(
      new Date(option.startsAt).getTime() + durationMinutes * 60 * 1000
    ).toISOString(),
  }))
