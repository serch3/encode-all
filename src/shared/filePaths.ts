/** Windows treats file names as case-insensitive and accepts both separators. */
export function filePathKey(filePath: string, platform: string): string {
  return platform === 'win32' ? filePath.replace(/\//g, '\\').toLowerCase() : filePath
}
