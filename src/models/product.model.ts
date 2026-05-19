import { Schema, model } from 'mongoose';

export interface ProductSpecs {
  [key: string]: string | number | boolean | string[];
}

export interface IProduct {
  _id: number;
  name: string;
  category: string;
  brand: string;
  images: string[];
  specs: ProductSpecs;
  stockQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    _id: { type: Number, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    brand: { type: String, required: true },
    images: [{ type: String }],
    specs: { type: Schema.Types.Mixed, default: {} },
    stockQuantity: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    _id: false,
  },
);

productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ name: 'text' });

export const Product = model<IProduct>('Product', productSchema, 'products');
