import { Module, Global } from '@nestjs/common';
import { MockTaobaoAdapter } from './mock-taobao.adapter';
import { MockDouyinAdapter } from './mock-douyin.adapter';

@Global()
@Module({
  providers: [MockTaobaoAdapter, MockDouyinAdapter],
  exports: [MockTaobaoAdapter, MockDouyinAdapter],
})
export class AdaptersModule {}
