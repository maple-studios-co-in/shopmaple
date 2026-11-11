/** What a product page hands an enquiry: the piece, its variant and code, and a delivery pincode, each bounded text. */
export type EnquiryContext = {
  product: string;
  variant: string;
  sku: string;
  pincode: string;
};
