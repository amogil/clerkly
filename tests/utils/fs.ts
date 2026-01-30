import fs from "fs";
import path from "path";

export const readText = (relativePath: string): string => {
  return fs.readFileSync(path.resolve(relativePath), "utf8");
};

export const readJson = <T>(relativePath: string): T => {
  return JSON.parse(readText(relativePath)) as T;
};

export const fileExists = (relativePath: string): boolean => {
  return fs.existsSync(path.resolve(relativePath));
};
