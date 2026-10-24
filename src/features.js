// Features that can be switched off without deleting their code.
// Multiplayer (co-op and arena) is off unless Vite runs in "multiplayer" mode
// (npm run dev:multi / build:multi), which loads .env.multiplayer.
export const MULTIPLAYER = import.meta.env.VITE_MULTIPLAYER === '1';
