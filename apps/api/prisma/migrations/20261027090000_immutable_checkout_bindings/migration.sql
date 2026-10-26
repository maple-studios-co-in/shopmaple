-- Source bindings are evidence captured at quote time, never a current-catalogue
-- cache. Legacy NULL bindings must also remain NULL rather than being guessed.
CREATE FUNCTION reject_checkout_binding_rewrite() RETURNS trigger AS $$
BEGIN
  IF NEW."catalogueBindings" IS DISTINCT FROM OLD."catalogueBindings" THEN
    RAISE EXCEPTION 'Checkout catalogue bindings are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER checkout_catalogue_bindings_immutable
BEFORE UPDATE OF "catalogueBindings" ON "CheckoutAttempt"
FOR EACH ROW EXECUTE FUNCTION reject_checkout_binding_rewrite();
