import type { GetServerSideProps } from 'next';

export default function Settings() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  return { redirect: { destination: `/teams/${params?.slug}/settings/general`, permanent: false } };
};
