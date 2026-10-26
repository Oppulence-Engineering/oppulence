import { cacheLife } from "next/cache";

import { marketingMetadata } from "../metadata";

import { SimProductsPage } from "../sim-landing/subpages/sim-products-page";

const DESCRIPTION =
  "One email-first assistant across Web, Desktop, and Voice. Start in your browser and add local tools or voice capture when you need them.";

export const metadata = marketingMetadata({
  title: "Products",
  description: DESCRIPTION,
  path: "/products",
});

export default async function ProductsRoute() {
  "use cache";
  cacheLife("days");
  return <SimProductsPage />;
}
