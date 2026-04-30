/**
 * Crop subpath — `@sentroy-co/client-sdk/react/crop` üzerinden lazy import
 * için ayrı bundle entry. `react-easy-crop` ana SDK import'unda yer almaz;
 * sadece crop kullanan consumer'lar bu modülü çekince bundle'a girer.
 */
export { CropDialog, type CropDialogProps } from "./CropDialog"
