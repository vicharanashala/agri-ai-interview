declare module "react-simple-maps" {
  import { ReactNode, MouseEvent, SVGProps } from "react";

  export interface GeographiesChildrenProps {
    geographies: Geography[];
    projection?: any;
    path?: any;
  }

  export interface Geography {
    rsmKey: string;
    properties: Record<string, string | number>;
    geometry: any;
    type: string;
    id?: string | number;
  }

  export interface ComposableMapProps {
    projection?: string;
    projectionConfig?: {
      center?: [number, number];
      scale?: number;
      rotate?: [number, number, number];
    };
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    children?: ReactNode;
  }

  export interface ZoomableGroupProps {
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    onMoveStart?: (pos: any, coords: any) => void;
    onMove?: (pos: any, coords: any) => void;
    onMoveEnd?: (pos: any, coords: any) => void;
    children?: ReactNode;
  }

  export interface GeographiesProps {
    geography: string | object;
    children: (props: GeographiesChildrenProps) => ReactNode;
    parseGeographies?: (geographies: any[]) => any[];
  }

  export interface GeographyProps {
    geography: Geography;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: SVGProps<SVGPathElement> & { outline?: string };
      hover?: SVGProps<SVGPathElement> & { outline?: string; opacity?: number };
      pressed?: SVGProps<SVGPathElement> & { outline?: string };
    };
    onMouseEnter?: (event: MouseEvent) => void;
    onMouseLeave?: (event: MouseEvent) => void;
    onClick?: (event: MouseEvent) => void;
    key?: string;
  }

  export function ComposableMap(props: ComposableMapProps): JSX.Element;
  export function ZoomableGroup(props: ZoomableGroupProps): JSX.Element;
  export function Geographies(props: GeographiesProps): JSX.Element;
  export function Geography(props: GeographyProps): JSX.Element;
}