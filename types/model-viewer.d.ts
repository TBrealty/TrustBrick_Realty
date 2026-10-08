import type { DetailedHTMLProps, HTMLAttributes } from "react";

/** <model-viewer>, the web component from @google/model-viewer, for the 3D tour. */
type ModelViewerAttributes = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  src: string;
  alt: string;
  "camera-controls"?: string;
  "auto-rotate"?: string;
  "auto-rotate-delay"?: string;
  "interaction-prompt"?: string;
  "touch-action"?: string;
  "shadow-intensity"?: string;
  exposure?: string;
  poster?: string;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerAttributes;
    }
  }
}
