export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export function errorResponse(error: unknown): { status: number; message: string } {
  if (error instanceof ApiError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof Error) {
    return { status: 500, message: error.message };
  }
  return { status: 500, message: 'Something went wrong' };
}
