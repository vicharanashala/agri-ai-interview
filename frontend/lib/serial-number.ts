/** 1-based S. No. of a row in a paginated list (`page` is 0-based), so page 2 at 10 rows starts at 11. */
export const serialNumber = (page: number, limit: number, index: number): number => page * limit + index + 1;
