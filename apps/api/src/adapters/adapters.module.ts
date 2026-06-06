import { Module, Global } from '@nestjs/common';
import { MockTaobaoAdapter } from './mock-taobao.adapter';
import { MockDouyinAdapter } from './mock-douyin.adapter';
import { ProviderAdapterRegistry } from './provider-adapter-registry.service';
import { ProviderCredentialResolverService } from "./provider-credential-resolver.service";

@Global()
@Module({
  providers: [
    MockTaobaoAdapter,
    MockDouyinAdapter,
    ProviderAdapterRegistry,
    ProviderCredentialResolverService,
  ],
  exports: [
    MockTaobaoAdapter,
    MockDouyinAdapter,
    ProviderAdapterRegistry,
    ProviderCredentialResolverService,
  ],
})
export class AdaptersModule {}
