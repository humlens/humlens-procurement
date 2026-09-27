import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { createUser, getUserByEmail } from 'models/user';
import { createTeam } from 'models/team';
import { handleApiError } from '@/lib/apiGuard';
import { validateWithSchema } from '@/lib/zod';
import { ApiError } from '@/lib/errors';

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  teamName: z.string().min(1),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  try {
    const { name, email, password, teamName } = validateWithSchema(signupSchema, req.body);

    if (await getUserByEmail(email)) {
      throw new ApiError(409, 'An account with this email already exists.');
    }

    const user = await createUser({ name, email, password });
    const team = await createTeam({ userId: user.id, name: teamName });

    res.status(201).json({ data: { user: { id: user.id, email: user.email }, team } });
  } catch (error) {
    handleApiError(res, error);
  }
}
