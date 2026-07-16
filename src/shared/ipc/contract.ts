import type { z } from "zod";

export interface IpcRequestContract<Args extends unknown[]> {
  channel: string;
  input: z.ZodType<Args>;
}

export function defineIpcRequest<Args extends unknown[]>(
  channel: string,
  input: z.ZodType<Args>,
): IpcRequestContract<Args> {
  return { channel, input };
}

export class IpcInputError extends Error {
  readonly code = "INVALID_IPC_INPUT";

  constructor(
    readonly channel: string,
    readonly issues: string[],
  ) {
    super(`Invalid input for IPC channel "${channel}": ${issues.join("; ")}`);
    this.name = "IpcInputError";
  }
}

export function parseIpcRequest<Args extends unknown[]>(
  contract: IpcRequestContract<Args>,
  input: unknown[],
): Args {
  const parsed = contract.input.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new IpcInputError(
    contract.channel,
    parsed.error.issues.map((issue) => {
      const location = issue.path.length > 0 ? issue.path.join(".") : "request";
      return `${location}: ${issue.message}`;
    }),
  );
}
