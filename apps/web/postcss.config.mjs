// Tailwind runs only on the stylesheets that import it (the admin token file); the
// storefront's plain CSS passes through untouched.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
