import { createContext, useContext } from 'react';
import type { TerraEngine } from '@/engine/TerraEngine';

export const EngineContext = createContext<TerraEngine | null>(null);

export function useEngine(): TerraEngine | null {
  return useContext(EngineContext);
}
