import type { EasyDrawProps, UIAppState } from "../types";
import clsx from "clsx";

export const LibraryMenuControlButtons = ({
  style,
  children,
  className,
}: {
  libraryReturnUrl: EasyDrawProps["libraryReturnUrl"];
  theme: UIAppState["theme"];
  id: string;
  style: React.CSSProperties;
  children?: React.ReactNode;
  className?: string;
}) => {
  if (!children) return null;
  return (
    <div className={clsx("library-menu-control-buttons", className)} style={style}>
      {children}
    </div>
  );
};
