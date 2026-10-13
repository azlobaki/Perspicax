export const IOC_TYPES = ["url", "domain", "ip", "email", "sha256", "sha1", "md5"] as const;

export type IocType = (typeof IOC_TYPES)[number];

export type Ioc = {
  type: IocType;
  value: string;
  /** Where it was seen: "From", "link in HTML body", "attachment x.pdf"… */
  sources: string[];
};
