// Persistence (data store)
export {
  SAVE_VERSION, MIN_LOADABLE_VERSION, checkSaveCompatibility, saveKey,
  writeSave, deleteSave, readAllSaves,
} from './data/save-data.ts';
export type { SaveType, SaveCompatibility, SaveData } from './data/save-data.ts';

// Domain view-models + helpers
export {
  buildEditableCountries, mapTeam,
  findTeamById, findDivisionForTeam, findCountryForTeam,
} from './domain/editable-country.ts';
export type { EditableCountry, EditableDivision } from './domain/editable-country.ts';
export type { LastMatchResult } from './domain/match-result.ts';

// Application session
export { GameSession } from './app/session.ts';
export type { GameSnapshot, AdvanceResult, AnimEvent } from './app/session.ts';

// Pragmatic CQRS facade (the surface the frontend uses)
export { createBackend } from './api/backend.ts';
export type { Backend, BackendCommands, BackendQueries, BackendEvents } from './api/backend.ts';
