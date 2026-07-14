import { ReactNode } from "react";

type KeepAliveViewProps = {
  active: boolean;
  visited: boolean;
  children: ReactNode;
};

export default function KeepAliveView({ active, visited, children }: KeepAliveViewProps) {
  if (!active && !visited) return null;

  return (
    <div className="app-view" hidden={!active}>
      {children}
    </div>
  );
}
