CREATE TABLE "ShopArticlePublication" (
    "blog" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopArticlePublication_pkey" PRIMARY KEY ("blog", "handle")
);
