'use client';

import React, { createContext, useContext, useState } from 'react';

interface DataContextType {
  dataVersion: number;
  notifyDataChanged: () => void;
}

const DataContext = createContext<DataContextType>({
  dataVersion: 0,
  notifyDataChanged: () => {},
});

export const useDataVersion = () => useContext(DataContext);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [dataVersion, setDataVersion] = useState(0);

  const notifyDataChanged = () => setDataVersion((prev) => prev + 1);

  return (
    <DataContext.Provider value={{ dataVersion, notifyDataChanged }}>
      {children}
    </DataContext.Provider>
  );
}