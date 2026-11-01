import { createContext, useContext } from 'react';

/** 0 = top of the navigation stack. Screens underneath freeze their derived views. */
export const SceneDepth = createContext(0);
export const useSceneDepth = () => useContext(SceneDepth);
