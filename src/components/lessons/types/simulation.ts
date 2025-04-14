// src/components/lessons/types/simulation.ts
export interface PhysicsParams {
  gravity: number;
  mass: number;
  velocity: number;
}

export interface ChemistryParams {
  temperature: number;
  concentration: number;
  reactionRate: number;
}

export interface BiologyParams {
  population: number;
  growthRate: number;
  capacity: number;
}

export type SimulationParameters = 
  | { type: 'physics'; params: PhysicsParams }
  | { type: 'chemistry'; params: ChemistryParams }
  | { type: 'biology'; params: BiologyParams };