import NextAuth from 'next-auth';

import { authOptions } from '@/lib/nextAuth';

export default NextAuth(authOptions);
