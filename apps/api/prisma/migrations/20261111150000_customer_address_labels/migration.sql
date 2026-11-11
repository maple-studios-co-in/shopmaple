-- An address's own name ("Home", "Studio"; Figma 392:1527), optional. Additive: existing addresses have none.
ALTER TABLE "CustomerAddress" ADD COLUMN "label" TEXT;
