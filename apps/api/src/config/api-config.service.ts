import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  type ApiConfig,
  loadApiConfig,
} from "./api-config";

export const API_CONFIG_OVERRIDE = "SMART_CS_API_CONFIG_OVERRIDE";

@Injectable()
export class ApiConfigService {
  private readonly config: ApiConfig;

  constructor(@Optional() @Inject(API_CONFIG_OVERRIDE) config?: ApiConfig) {
    this.config = config ?? loadApiConfig();
  }

  getProviderWriteLiveExecutorStatus() {
    return this.config.providerWriteLiveExecutorStatus;
  }
}
