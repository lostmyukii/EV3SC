#import <Foundation/Foundation.h>
#import <IOBluetooth/IOBluetooth.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

// Source basis:
// - Scratch Link MacBTSession uses IOBluetooth and RFCOMM channel 1 for
//   Bluetooth Classic serial peripherals.
// - LEGO EV3 official firmware consumes Direct Command byte frames over the
//   RFCOMM stream after the EV3 is paired in macOS Bluetooth settings.

@interface WeisileRFCOMMDelegate : NSObject
@property(nonatomic, strong) NSMutableArray<NSData *> *frames;
@property(nonatomic, assign) BOOL closed;
- (NSData *)popFrameWithTimeout:(NSTimeInterval)timeoutSeconds;
@end

@implementation WeisileRFCOMMDelegate

- (instancetype)init
{
    self = [super init];
    if (self) {
        _frames = [NSMutableArray array];
        _closed = NO;
    }
    return self;
}

- (void)rfcommChannelData:(IOBluetoothRFCOMMChannel *)rfcommChannel
                    data:(void *)dataPointer
                  length:(size_t)dataLength
{
    (void)rfcommChannel;
    NSData *frame = [NSData dataWithBytes:dataPointer length:dataLength];
    @synchronized (self) {
        [self.frames addObject:frame];
    }
}

- (void)rfcommChannelClosed:(IOBluetoothRFCOMMChannel *)rfcommChannel
{
    (void)rfcommChannel;
    @synchronized (self) {
        self.closed = YES;
    }
}

- (NSData *)popFrameWithTimeout:(NSTimeInterval)timeoutSeconds
{
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:timeoutSeconds];
    while ([deadline timeIntervalSinceNow] > 0) {
        @synchronized (self) {
            if (self.frames.count > 0) {
                NSData *frame = self.frames.firstObject;
                [self.frames removeObjectAtIndex:0];
                return frame;
            }
            if (self.closed) {
                return nil;
            }
        }
        [[NSRunLoop currentRunLoop]
            runMode:NSDefaultRunLoopMode
         beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
    }
    return nil;
}

@end

@interface WeisileEV3BluetoothAdapter : NSObject
@property(nonatomic, strong) IOBluetoothDevice *device;
@property(nonatomic, strong) IOBluetoothRFCOMMChannel *channel;
@property(nonatomic, strong) WeisileRFCOMMDelegate *delegate;
@property(nonatomic, assign) BluetoothRFCOMMChannelID channelID;
@property(nonatomic, copy) NSString *profile;
- (NSDictionary *)connect:(NSDictionary *)params errorMessage:(NSString **)error;
- (NSDictionary *)send:(NSDictionary *)params errorMessage:(NSString **)error;
- (NSDictionary *)recv:(NSDictionary *)params errorMessage:(NSString **)error;
- (NSDictionary *)status:(NSDictionary *)params errorMessage:(NSString **)error;
- (NSDictionary *)close:(NSDictionary *)params errorMessage:(NSString **)error;
@end

@implementation WeisileEV3BluetoothAdapter

- (instancetype)init
{
    self = [super init];
    if (self) {
        _channelID = 1;
        _profile = @"rfcomm";
        _delegate = [[WeisileRFCOMMDelegate alloc] init];
    }
    return self;
}

- (NSDictionary *)connect:(NSDictionary *)params errorMessage:(NSString **)error
{
    NSString *address = [params[@"address"] description];
    if (address.length == 0) {
        *error = @"connect requires EV3 Bluetooth address";
        return nil;
    }
    NSNumber *channelParam = params[@"channel"];
    if ([channelParam respondsToSelector:@selector(unsignedCharValue)]) {
        self.channelID =
            (BluetoothRFCOMMChannelID)[channelParam unsignedCharValue];
    }
    NSString *profile = [params[@"profile"] description];
    if (profile.length > 0) {
        self.profile = profile;
    }

    self.device = [IOBluetoothDevice deviceWithAddressString:address];
    if (self.device == nil) {
        *error = [NSString
            stringWithFormat:@"EV3 Bluetooth device not found: %@", address];
        return nil;
    }
    if (![self.device isPaired]) {
        *error = @"pair EV3 in macOS Bluetooth settings first";
        return nil;
    }
    if ([self.device isConnected]) {
        [self.device closeConnection];
        [NSThread sleepForTimeInterval:1.0];
    }

    IOBluetoothRFCOMMChannel *openedChannel = nil;
    IOReturn result =
        [self.device openRFCOMMChannelSync:&openedChannel
                             withChannelID:self.channelID
                                  delegate:self.delegate];
    if (openedChannel == nil) {
        result = [self.device openRFCOMMChannelAsync:&openedChannel
                                      withChannelID:self.channelID
                                           delegate:self.delegate];
    }

    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:30.0];
    while (openedChannel != nil && ![openedChannel isOpen] &&
           [deadline timeIntervalSinceNow] > 0) {
        [[NSRunLoop currentRunLoop]
            runMode:NSDefaultRunLoopMode
         beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
    }

    if (openedChannel == nil || ![openedChannel isOpen]) {
        *error = [NSString stringWithFormat:
            @"could not open EV3 RFCOMM channel: 0x%08x", result];
        return nil;
    }

    self.channel = openedChannel;
    return @{
        @"address": address,
        @"channel": @(self.channelID),
        @"profile": self.profile ?: @"rfcomm"
    };
}

- (NSDictionary *)send:(NSDictionary *)params errorMessage:(NSString **)error
{
    if (self.channel == nil || ![self.channel isOpen]) {
        *error = @"cannot send when EV3 RFCOMM channel is not open";
        return nil;
    }
    NSString *payloadBase64 = [params[@"payload"] description];
    NSData *payload =
        [[NSData alloc] initWithBase64EncodedString:payloadBase64 options:0];
    if (payload == nil) {
        *error = @"send requires base64 payload";
        return nil;
    }
    if (payload.length > UINT16_MAX) {
        *error = @"payload is too large for one RFCOMM write";
        return nil;
    }

    NSMutableData *mutablePayload = [payload mutableCopy];
    IOReturn result = [self.channel writeSync:mutablePayload.mutableBytes
                                       length:(UInt16)mutablePayload.length];
    if (result != kIOReturnSuccess) {
        *error = [NSString
            stringWithFormat:@"EV3 RFCOMM write failed: 0x%08x", result];
        return nil;
    }
    return @{@"bytesWritten": @(mutablePayload.length)};
}

- (NSDictionary *)recv:(NSDictionary *)params errorMessage:(NSString **)error
{
    double timeout = 5.0;
    NSNumber *timeoutParam = params[@"timeout"];
    if ([timeoutParam respondsToSelector:@selector(doubleValue)]) {
        timeout = [timeoutParam doubleValue];
    }
    NSData *frame = [self.delegate popFrameWithTimeout:timeout];
    if (frame == nil) {
        *error = @"EV3 RFCOMM read timed out";
        return nil;
    }
    return @{@"payload": [frame base64EncodedStringWithOptions:0]};
}

- (NSDictionary *)status:(NSDictionary *)params errorMessage:(NSString **)error
{
    (void)params;
    (void)error;
    BOOL connected = self.channel != nil && [self.channel isOpen];
    return @{
        @"connected": @(connected),
        @"adapter_version": @"macos-iobluetooth-1",
        @"profile": self.profile ?: @"rfcomm"
    };
}

- (NSDictionary *)close:(NSDictionary *)params errorMessage:(NSString **)error
{
    (void)params;
    (void)error;
    if (self.channel != nil) {
        [self.channel closeChannel];
        self.channel = nil;
    }
    if (self.device != nil) {
        [self.device closeConnection];
        self.device = nil;
    }
    return @{@"closed": @YES};
}

@end

static void WriteJSON(FILE *stream, NSDictionary *payload)
{
    NSError *error = nil;
    NSData *data =
        [NSJSONSerialization dataWithJSONObject:payload options:0 error:&error];
    if (data == nil) {
        fprintf(
            stream,
            "{\"ok\":false,\"error\":\"json serialization failed\"}\n");
        fflush(stream);
        return;
    }
    fwrite(data.bytes, 1, data.length, stream);
    fputc('\n', stream);
    fflush(stream);
}

static NSDictionary *ReadRequest(char *line)
{
    NSString *string = [NSString stringWithUTF8String:line];
    NSData *data = [string dataUsingEncoding:NSUTF8StringEncoding];
    if (data == nil) {
        return nil;
    }
    id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    if (![value isKindOfClass:[NSDictionary class]]) {
        return nil;
    }
    return value;
}

static NSString *ArgumentValue(int argc, const char *argv[], NSString *name)
{
    for (int index = 1; index < argc - 1; index++) {
        NSString *argument =
            [NSString stringWithUTF8String:argv[index] ?: ""];
        if ([argument isEqualToString:name]) {
            return [NSString stringWithUTF8String:argv[index + 1] ?: ""];
        }
    }
    return nil;
}

static int OpenLoopbackSocket(NSString *host, NSString *portString)
{
    if (host.length == 0 || portString.length == 0) {
        return -1;
    }
    int socketFD = socket(AF_INET, SOCK_STREAM, 0);
    if (socketFD < 0) {
        return -1;
    }

    struct sockaddr_in address;
    memset(&address, 0, sizeof(address));
    address.sin_family = AF_INET;
    address.sin_port = htons((uint16_t)[portString intValue]);
    if (inet_pton(AF_INET, host.UTF8String, &address.sin_addr) != 1) {
        close(socketFD);
        return -1;
    }
    if (connect(socketFD, (struct sockaddr *)&address, sizeof(address)) != 0) {
        close(socketFD);
        return -1;
    }
    return socketFD;
}

int main(int argc, const char *argv[])
{
    @autoreleasepool {
        WeisileEV3BluetoothAdapter *adapter =
            [[WeisileEV3BluetoothAdapter alloc] init];
        NSString *inputPath = ArgumentValue(argc, argv, @"--input");
        NSString *outputPath = ArgumentValue(argc, argv, @"--output");
        NSString *host = ArgumentValue(argc, argv, @"--host");
        NSString *port = ArgumentValue(argc, argv, @"--port");
        FILE *input = stdin;
        FILE *output = stdout;
        int socketFD = -1;
        if (host.length > 0 || port.length > 0) {
            socketFD = OpenLoopbackSocket(host, port);
            if (socketFD < 0) {
                return 2;
            }
            input = fdopen(socketFD, "r");
            output = fdopen(dup(socketFD), "w");
        }
        if (inputPath.length > 0) {
            input = fopen(inputPath.UTF8String, "r");
        }
        if (outputPath.length > 0) {
            output = fopen(outputPath.UTF8String, "w");
        }
        if (input == NULL || output == NULL) {
            return 2;
        }
        char *line = NULL;
        size_t length = 0;

        while (getline(&line, &length, input) != -1) {
            NSDictionary *request = ReadRequest(line);
            NSNumber *requestID = request[@"id"] ?: @0;
            NSString *method = [request[@"method"] description];
            NSDictionary *params =
                [request[@"params"] isKindOfClass:[NSDictionary class]]
                    ? request[@"params"]
                    : @{};
            NSString *errorMessage = nil;
            NSDictionary *result = nil;

            if ([method isEqualToString:@"connect"]) {
                result = [adapter connect:params errorMessage:&errorMessage];
            } else if ([method isEqualToString:@"send"]) {
                result = [adapter send:params errorMessage:&errorMessage];
            } else if ([method isEqualToString:@"recv"]) {
                result = [adapter recv:params errorMessage:&errorMessage];
            } else if ([method isEqualToString:@"status"]) {
                result = [adapter status:params errorMessage:&errorMessage];
            } else if ([method isEqualToString:@"close"]) {
                result = [adapter close:params errorMessage:&errorMessage];
            } else {
                errorMessage = @"unknown native adapter method";
            }

            if (errorMessage != nil) {
                WriteJSON(output, @{
                    @"id": requestID,
                    @"ok": @NO,
                    @"error": errorMessage
                });
            } else {
                WriteJSON(output, @{
                    @"id": requestID,
                    @"ok": @YES,
                    @"result": result ?: @{}
                });
            }
        }
        free(line);
        if (input != stdin && input != NULL) {
            fclose(input);
        }
        if (output != stdout && output != NULL) {
            fclose(output);
        }
    }
    return 0;
}
