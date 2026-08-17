import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Yuppie",
    short_name: "Yuppie",
    description: "Your Social Life, Curated",
    start_url: "/",
    display: "standalone",
    background_color: "#FFD904",
    theme_color: "#FFD904",
    icons: [
      {
        src: "/yuppie_app_icon_32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/yuppie_app_icon_1024.png",
        sizes: "1024x1024",
        type: "image/png",
      },
    ],
  };
}
