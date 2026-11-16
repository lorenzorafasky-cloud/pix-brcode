/**
 * Official examples from the Banco Central do Brasil
 * "Manual de Padrões para Iniciação do Pix", version 2.10.0 (19/08/2026), sections 2.6.3,
 * 2.7.2 and 2.8.5. Line breaks of the printed manual were removed.
 */
export const BCB_STATIC =
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D'

export const BCB_DYNAMIC =
  '00020101021226700014br.gov.bcb.pix2548pix.example.com/8b3da2f39a4140d1a91abd93113bd4415204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***630464E4'

export const BCB_COMPOSITE_RECURRENCE_ONLY =
  '00020126180014br.gov.bcb.pix5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***80740014br.gov.bcb.pix2552pix.example.com/rec/2353c790eefb11eaadc10242ac1200026304F2DA'

export const BCB_COMPOSITE_STATIC =
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865406100.505802BR5913Fulano de Tal6008BRASILIA62070503***80740014br.gov.bcb.pix2552pix.example.com/rec/2353c790eefb11eaadc10242ac12000263042875'

export const BCB_COMPOSITE_DYNAMIC =
  '00020101021226700014br.gov.bcb.pix2548pix.example.com/8b3da2f39a4140d1a91abd93113bd4415204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***80740014br.gov.bcb.pix2552pix.example.com/rec/2353c790eefb11eaadc10242ac1200026304FB42'

export const BCB_EVP = '123e4567-e12b-12d1-a456-426655440000'
export const BCB_URL = 'pix.example.com/8b3da2f39a4140d1a91abd93113bd441'
export const BCB_RECURRENCE_URL = 'pix.example.com/rec/2353c790eefb11eaadc10242ac120002'
export const BCB_MERCHANT = { merchantName: 'Fulano de Tal', merchantCity: 'BRASILIA' } as const
