import { Module, Global } from '@nestjs/common';
import { MockTaobaoAdapter } from './mock-taobao.adapter';
import { MockDouyinAdapter } from './mock-douyin.adapter';
import { ProviderAdapterRegistry } from './provider-adapter-registry.service';
import { ProviderCredentialResolverService } from "./provider-credential-resolver.service";
import { ProviderCredentialStoreService } from "./provider-credential-store.service";

@Global()
@Module({
  providers: [
    MockTaobaoAdapter,
    MockDouyinAdapter,
    ProviderAdapterRegistry,
    ProviderCredentialStoreService,
    ProviderCredentialResolverService,
  ],
  exports: [
    MockTaobaoAdapter,
    MockDouyinAdapter,
    ProviderAdapterRegistry,
    ProviderCredentialStoreService,
    ProviderCredentialResolverService,
  ],
})
export class AdaptersModule {}
