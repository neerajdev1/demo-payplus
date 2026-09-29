import Store from "./store";

export default async function Home(props: PageProps<"/">) {
  const { order } = await props.searchParams;
  return <Store returnedOrder={typeof order === "string" ? order : undefined} />;
}
