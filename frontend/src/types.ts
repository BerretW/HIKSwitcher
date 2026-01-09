
export interface HikNode {
  id: string;
  tag: string;
  text: string;
  children: HikNode[];
  fullPath: string;
  capabilities?: HikCapabilities;
  parentTag?: string;
  rawElement: Element;
}

export interface HikCapabilities {
  min?: number;
  max?: number;
  options?: string[];
}

export enum EditType {
  TEXT = 'text',
  RANGE = 'range',
  LIST = 'list'
}

export interface LoxoneConfig {
  address: string;
  instruction: string;
  body: string;
  isDimmer: boolean;
}
