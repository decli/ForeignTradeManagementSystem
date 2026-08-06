import { redirect } from "next/navigation";

export default function Home() {
  // 第一期的落地页就是跟单表
  redirect("/follow-ups");
}
