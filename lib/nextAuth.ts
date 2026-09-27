import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';
import { getUserByEmail } from 'models/user';

// Browsers don't scope cookies by port on `localhost`, so this app and its
// sibling Humlens apps (inventory, etc.) running on other localhost ports
// would otherwise all fight over NextAuth's default cookie name
// (`next-auth.session-token`) — whichever app you signed into most recently
// wins the cookie slot, and every other app looks logged-out on refresh
// because it can't decode a JWT signed with a different app's secret. Giving
// each app its own cookie name isolates them completely.
const useSecureCookies = (process.env.NEXTAUTH_URL || '').startsWith('https://');
const cookiePrefix = useSecureCookies ? '__Secure-' : '';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: '/auth/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}humlens-procurement.session-token`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies },
    },
    callbackUrl: {
      name: `${cookiePrefix}humlens-procurement.callback-url`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies },
    },
    csrfToken: {
      name: `${useSecureCookies ? '__Host-' : ''}humlens-procurement.csrf-token`,
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: useSecureCookies },
    },
  },
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await getUserByEmail(credentials.email);

        if (!user || !user.password) {
          throw new Error('invalid-credentials');
        }

        const isValid = await verifyPassword(credentials.password, user.password);

        if (!isValid) {
          throw new Error('invalid-credentials');
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
};
