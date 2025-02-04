import {
  InvalidCarrierForPhoneMetadataError,
  InvalidCarrierTypeForPhoneMetadataError,
  InvalidCountryCodeForPhoneMetadataError,
  InvalidErrorCodeForPhoneMetadataError,
  InvalidMobileCountryCodeForPhoneMetadataError,
} from "./errors"

import { CarrierType } from "@/domain/phone-provider"

const checkedToCarrierType = (
  rawCarrierType: string | undefined | null,
): CarrierType | ValidationError => {
  if (!rawCarrierType) {
    return CarrierType.Null
  }

  if (!Object.values(CarrierType).includes(rawCarrierType as CarrierType)) {
    return new InvalidCarrierTypeForPhoneMetadataError(rawCarrierType)
  }

  return rawCarrierType as CarrierType
}

export const PhoneMetadataValidator = (): PhoneMetadataValidator => {
  const validate = (
    rawPhoneMetadata: Record<string, string | Record<string, string | null>>,
  ): PhoneMetadata | ValidationError => {
    const { carrier, countryCode } = rawPhoneMetadata

    if (typeof carrier !== "object") {
      return new InvalidCarrierForPhoneMetadataError(carrier)
    }
    const {
      error_code,
      mobile_country_code,
      mobile_network_code,
      name,
      type: rawType,
    } = carrier

    const type = checkedToCarrierType(rawType)
    if (type instanceof Error) return type

    if (typeof error_code !== "string") {
      return new InvalidErrorCodeForPhoneMetadataError(countryCode)
    }

    if (typeof mobile_country_code !== "string") {
      return new InvalidMobileCountryCodeForPhoneMetadataError(countryCode)
    }

    if (typeof countryCode !== "string") {
      return new InvalidCountryCodeForPhoneMetadataError(countryCode)
    }

    return {
      carrier: { error_code, mobile_country_code, mobile_network_code, name, type },
      countryCode,
    }
  }

  return { validate }
}
