package com.example.screenshare.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class ForwardController {

    // SPA(React)のルーティング用。ルートまたは /broadcast にアクセスした際に静的ファイルの index.html を返す
    @GetMapping(value = {"/", "/broadcast"})
    public String forward() {
        return "forward:/index.html";
    }
}
