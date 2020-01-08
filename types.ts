export type Commit = {
  hash: string; 
  filePath: string; 
  timestampS: number;
  author: string;
  count: number;
  files: string[];
};
