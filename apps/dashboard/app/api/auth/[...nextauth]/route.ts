import NextAuth from "next-auth"
import GithubProvider from "next-auth/providers/auth0"
import { ProviderType } from "next-auth/providers/index"

const type = "oauth" as const // as ProviderType

export const authOptions = {
  // Configure one or more authentication providers
  providers: [
    {
      id: "blink",
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      wellKnown: "http://127.0.0.1:4444/.well-known/openid-configuration",
      useSecureCookies: false,
      authorization: { params: { scope: "offline transactions:read" } },
      idToken: false,
      name: "Blink",
      type,
      profile(profile) {
        console.log({ profile }, "profile123")
        return {
          id: profile.sub,
          // email: profile.email,
        }
      },
    },
    // ...add more providers here
  ],
  debug: true,
  secret: process.env.NEXTAUTH_SECRET as string,
  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist the OAuth access_token and or the user id to the token right after signin
      if (account) {
        token.accessToken = account.access_token
        token.expiresAt = account.expires_at
        token.refreshToken = account.refresh_token
        token.id = profile.id
      }
      return token
    },
    async session({ session, token, user }) {
      console.log({ session, token, user }, "session12")
      // Send properties to the client, like an access_token from a provider.
      session.sub = token.sub
      session.accessToken = token.accessToken
      return session
    },
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }