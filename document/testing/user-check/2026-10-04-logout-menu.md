# Account menu and sign out

## What I tried

- Signed in with the local test account.
- Clicked the round account avatar in the top-right corner.
- Chose **Sign out** from the rounded account menu.
- Opened Home again after signing out.

## Result

The menu showed the signed-in user's name and email with a clear **Sign out** action. Choosing it returned me to Login. Opening Home again while signed out returned me to Login as well.

## Development startup

The Docker development stack is running Next.js and Nest watch mode with the repository mounted into the containers. The `pnpm docker:dev` command recreated the services without an image build after the one-time development image build.
