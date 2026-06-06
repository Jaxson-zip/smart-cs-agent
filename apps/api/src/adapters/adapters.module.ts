import { Module, Global } from '@nestjs/common';
import { MockTaobaoAdapter } from './mock-taobao.adapter';
import { MockDouyinAdapter } from './mock-douyin.adapter';
import { ProviderAdapterRegistry } from './provider-adapter-registry.service';

@Global()
@Module({
  providers: [MockTaobaoAdapter, MockDouyinAdapter, ProviderAdapterRegistry],
  exports: [MockTaobaoAdapter, MockDouyinAdapter, ProviderAdapterRegistry],
})
export class AdaptersModule {}
